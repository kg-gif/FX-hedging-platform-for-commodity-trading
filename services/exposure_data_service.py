"""
BIRK FX Phase 2B Extended - Data Import Service
Handles CSV/Excel uploads and manual data entry for customer FX exposures
"""

import pandas as pd
import numpy as np
from datetime import datetime, timedelta
from typing import Dict, List, Optional, Tuple
import io
import csv
import json


class ExposureDataService:
    """
    Service for importing and managing customer FX exposure data
    Supports CSV, Excel, and manual entry
    """
    
    # Supported file formats
    SUPPORTED_FORMATS = ['.csv', '.xlsx', '.xls']
    
    # Required columns (flexible matching)
    REQUIRED_COLUMNS = {
        'reference': ['reference', 'ref', 'reference_number', 'ref_no', 'id', 'transaction_id'],
        'currency': ['currency', 'ccy', 'currency_pair', 'pair', 'fx_pair'],
        'amount': ['amount', 'notional', 'exposure', 'value', 'qty', 'quantity'],
        'start_date': ['start_date', 'start', 'from_date', 'begin_date', 'value_date'],
        'end_date': ['end_date', 'end', 'to_date', 'maturity_date', 'settlement_date']
    }
    
    def __init__(self, db_connection=None):
        self.db = db_connection
        
    def parse_uploaded_file(
        self, 
        file_content: bytes, 
        filename: str,
        company_id: int
    ) -> Dict:
        """
        Parse uploaded CSV or Excel file containing exposure data
        
        Args:
            file_content: Raw file bytes
            filename: Original filename
            company_id: Company ID for attribution
            
        Returns:
            Dictionary with parsed data and validation results
        """
        
        # Determine file type
        file_extension = filename.lower().split('.')[-1]
        
        if file_extension == 'csv':
            df = self._parse_csv(file_content)
        elif file_extension in ['xlsx', 'xls']:
            df = self._parse_excel(file_content)
        else:
            return {
                'success': False,
                'error': f'Unsupported file format: {file_extension}',
                'supported_formats': self.SUPPORTED_FORMATS
            }
        
        # Map columns to standard names
        df = self._standardize_columns(df)
        
        # Validate data
        validation_result = self._validate_data(df)
        
        if not validation_result['is_valid']:
            return {
                'success': False,
                'error': 'Data validation failed',
                'validation_errors': validation_result['errors'],
                'row_count': len(df)
            }
        
        # Convert to exposure records
        exposures = self._convert_to_exposures(df, company_id)
        
        # Calculate summary statistics
        summary = self._calculate_summary(exposures)
        
        return {
            'success': True,
            'filename': filename,
            'row_count': len(exposures),
            'exposures': exposures,
            'summary': summary,
            'validation_warnings': validation_result.get('warnings', [])
        }
    
    def _parse_csv(self, file_content: bytes) -> pd.DataFrame:
        """Parse CSV file with flexible encoding and delimiter detection"""
        
        # Try different encodings
        for encoding in ['utf-8', 'latin-1', 'iso-8859-1', 'cp1252']:
            try:
                content_str = file_content.decode(encoding)
                break
            except UnicodeDecodeError:
                continue
        else:
            raise ValueError("Unable to decode file with supported encodings")
        
        # Detect delimiter
        sniffer = csv.Sniffer()
        sample = content_str[:1024]
        delimiter = sniffer.sniff(sample).delimiter
        
        # Parse CSV
        df = pd.read_csv(
            io.StringIO(content_str),
            delimiter=delimiter,
            skipinitialspace=True,
            na_values=['', 'N/A', 'NA', 'null', 'NULL']
        )
        
        return df
    
    def _parse_excel(self, file_content: bytes) -> pd.DataFrame:
        """Parse Excel file"""
        
        df = pd.read_excel(
            io.BytesIO(file_content),
            na_values=['', 'N/A', 'NA', 'null', 'NULL']
        )
        
        return df
    
    def _standardize_columns(self, df: pd.DataFrame) -> pd.DataFrame:
        """Map various column names to standard names"""
        
        column_mapping = {}
        
        # Convert all column names to lowercase for matching
        df.columns = df.columns.str.strip().str.lower()
        
        # Find matching columns
        for standard_name, possible_names in self.REQUIRED_COLUMNS.items():
            for col in df.columns:
                if col in possible_names:
                    column_mapping[col] = standard_name
                    break
        
        # Rename columns
        df = df.rename(columns=column_mapping)
        
        return df
    
    def _validate_data(self, df: pd.DataFrame) -> Dict:
        """Validate parsed data for required fields and formats"""
        
        errors = []
        warnings = []
        
        # Check for required columns
        required = ['reference', 'currency', 'amount', 'start_date', 'end_date']
        missing_columns = [col for col in required if col not in df.columns]
        
        if missing_columns:
            errors.append(f"Missing required columns: {', '.join(missing_columns)}")
            return {
                'is_valid': False,
                'errors': errors
            }
        
        # Validate each row
        for idx, row in df.iterrows():
            row_num = idx + 2  # Account for header row
            
            # Reference validation
            if pd.isna(row['reference']):
                errors.append(f"Row {row_num}: Missing reference number")
            
            # Currency validation
            if pd.isna(row['currency']):
                errors.append(f"Row {row_num}: Missing currency")
            else:
                currency = str(row['currency']).strip().upper()
                if len(currency) < 6 or len(currency) > 7:
                    warnings.append(f"Row {row_num}: Currency format '{currency}' may be invalid (expected format: EURUSD)")
            
            # Amount validation
            try:
                amount = float(row['amount'])
                if amount <= 0:
                    errors.append(f"Row {row_num}: Amount must be positive")
            except (ValueError, TypeError):
                errors.append(f"Row {row_num}: Invalid amount format")
            
            # Date validation
            for date_field in ['start_date', 'end_date']:
                try:
                    if pd.isna(row[date_field]):
                        errors.append(f"Row {row_num}: Missing {date_field}")
                    else:
                        parsed_date = pd.to_datetime(row[date_field])
                        if parsed_date.year < 2000 or parsed_date.year > 2100:
                            warnings.append(f"Row {row_num}: {date_field} seems unusual ({parsed_date.date()})")
                except Exception:
                    errors.append(f"Row {row_num}: Invalid {date_field} format")
            
            # Date range validation
            try:
                start = pd.to_datetime(row['start_date'])
                end = pd.to_datetime(row['end_date'])
                if start >= end:
                    errors.append(f"Row {row_num}: Start date must be before end date")
            except Exception:
                pass  # Already caught in date validation
        
        return {
            'is_valid': len(errors) == 0,
            'errors': errors,
            'warnings': warnings
        }
    
    def _convert_to_exposures(
        self, 
        df: pd.DataFrame, 
        company_id: int
    ) -> List[Dict]:
        """Convert DataFrame to exposure record dictionaries"""
        
        exposures = []
        
        for idx, row in df.iterrows():
            try:
                exposure = {
                    'company_id': company_id,
                    'reference_number': str(row['reference']).strip(),
                    'currency_pair': str(row['currency']).strip().upper(),
                    'amount': float(row['amount']),
                    'start_date': pd.to_datetime(row['start_date']).strftime('%Y-%m-%d'),
                    'end_date': pd.to_datetime(row['end_date']).strftime('%Y-%m-%d'),
                    'period_days': (pd.to_datetime(row['end_date']) - pd.to_datetime(row['start_date'])).days,
                    'status': 'active',
                    'created_at': datetime.now().isoformat(),
                    'source': 'file_upload'
                }
                
                # Add optional fields if present
                if 'description' in row and not pd.isna(row['description']):
                    exposure['description'] = str(row['description']).strip()
                
                if 'rate' in row and not pd.isna(row['rate']):
                    exposure['rate'] = float(row['rate'])
                
                exposures.append(exposure)
                
            except Exception as e:
                # Skip invalid rows but log them
                print(f"Warning: Skipping row {idx + 2}: {str(e)}")
                continue
        
        return exposures
    
    def _calculate_summary(self, exposures: List[Dict]) -> Dict:
        """Calculate summary statistics for uploaded exposures"""
        
        if not exposures:
            return {}
        
        # Group by currency
        currency_summary = {}
        for exp in exposures:
            ccy = exp['currency_pair']
            if ccy not in currency_summary:
                currency_summary[ccy] = {
                    'count': 0,
                    'total_amount': 0,
                    'avg_amount': 0,
                    'min_amount': float('inf'),
                    'max_amount': 0,
                    'avg_period_days': 0
                }
            
            currency_summary[ccy]['count'] += 1
            currency_summary[ccy]['total_amount'] += exp['amount']
            currency_summary[ccy]['min_amount'] = min(currency_summary[ccy]['min_amount'], exp['amount'])
            currency_summary[ccy]['max_amount'] = max(currency_summary[ccy]['max_amount'], exp['amount'])
            currency_summary[ccy]['avg_period_days'] += exp['period_days']
        
        # Calculate averages
        for ccy, stats in currency_summary.items():
            stats['avg_amount'] = stats['total_amount'] / stats['count']
            stats['avg_period_days'] = stats['avg_period_days'] / stats['count']
        
        # Overall summary
        total_exposures = len(exposures)
        total_amount = sum(exp['amount'] for exp in exposures)
        unique_currencies = len(currency_summary)
        avg_period = sum(exp['period_days'] for exp in exposures) / total_exposures
        
        # Date range
        all_start_dates = [datetime.strptime(exp['start_date'], '%Y-%m-%d') for exp in exposures]
        all_end_dates = [datetime.strptime(exp['end_date'], '%Y-%m-%d') for exp in exposures]
        
        return {
            'total_exposures': total_exposures,
            'total_amount': round(total_amount, 2),
            'unique_currencies': unique_currencies,
            'currency_breakdown': currency_summary,
            'avg_period_days': round(avg_period, 0),
            'earliest_start_date': min(all_start_dates).strftime('%Y-%m-%d'),
            'latest_end_date': max(all_end_dates).strftime('%Y-%m-%d'),
            'currencies': list(currency_summary.keys())
        }
    
    def create_manual_exposure(
        self,
        company_id: int,
        reference_number: str,
        currency_pair: str,
        amount: float,
        start_date: str,
        end_date: str,
        description: Optional[str] = None,
        rate: Optional[float] = None
    ) -> Dict:
        """
        Create a single exposure record from manual entry
        
        Args:
            company_id: Company ID
            reference_number: Unique reference
            currency_pair: Currency pair (e.g., EURUSD)
            amount: Exposure amount
            start_date: Start date (YYYY-MM-DD)
            end_date: End date (YYYY-MM-DD)
            description: Optional description
            rate: Optional FX rate
            
        Returns:
            Dictionary with created exposure and validation results
        """
        
        # Validate inputs
        validation_errors = []
        
        if not reference_number or not reference_number.strip():
            validation_errors.append("Reference number is required")
        
        if not currency_pair or len(currency_pair.strip()) < 6:
            validation_errors.append("Valid currency pair is required (e.g., EURUSD)")
        
        try:
            amount = float(amount)
            if amount <= 0:
                validation_errors.append("Amount must be positive")
        except (ValueError, TypeError):
            validation_errors.append("Invalid amount format")
        
        try:
            start = datetime.strptime(start_date, '%Y-%m-%d')
        except ValueError:
            validation_errors.append("Invalid start date format (use YYYY-MM-DD)")
        
        try:
            end = datetime.strptime(end_date, '%Y-%m-%d')
        except ValueError:
            validation_errors.append("Invalid end date format (use YYYY-MM-DD)")
        
        if not validation_errors:
            try:
                if start >= end:
                    validation_errors.append("Start date must be before end date")
            except:
                pass
        
        if validation_errors:
            return {
                'success': False,
                'errors': validation_errors
            }
        
        # Calculate period
        period_days = (end - start).days
        
      # Create exposure record
# Split currency pair into from_currency and to_currency
currency_pair_upper = currency_pair.strip().upper()
if len(currency_pair_upper) == 6:
    from_currency = currency_pair_upper[:3]
    to_currency = currency_pair_upper[3:]
else:
    # Handle cases like "EUR/USD" or "EUR-USD"
    currency_pair_upper = currency_pair_upper.replace('/', '').replace('-', '')
    from_currency = currency_pair_upper[:3]
    to_currency = currency_pair_upper[3:]

exposure = {
    'company_id': company_id,
    'reference_number': reference_number.strip(),
    'from_currency': from_currency,
    'to_currency': to_currency,
    'amount': float(amount),
    'start_date': start_date,
    'end_date': end_date,
    'period_days': period_days,
    'status': 'active',
    'created_at': datetime.now().isoformat(),
    'source': 'manual_entry'
}
        
        if description:
            exposure['description'] = description.strip()
        
        if rate:
            try:
                exposure['rate'] = float(rate)
            except (ValueError, TypeError):
                pass
        
        # In production, save to database
        # exposure_id = self.db.insert('exposures', exposure)
        # exposure['id'] = exposure_id
        
        # Mock ID for testing
        exposure['id'] = np.random.randint(1000, 9999)
        
        return {
            'success': True,
            'exposure': exposure,
            'message': f'Exposure {reference_number} created successfully'
        }
    
    def get_exposures_by_period(
        self,
        company_id: int,
        start_date: str,
        end_date: str
    ) -> List[Dict]:
        """
        Get all exposures within a date range
        
        Args:
            company_id: Company ID
            start_date: Period start date
            end_date: Period end date
            
        Returns:
            List of exposure records
        """
        
        # In production, query from database
        # exposures = self.db.query(
        #     "SELECT * FROM exposures WHERE company_id = ? AND "
        #     "((start_date >= ? AND start_date <= ?) OR "
        #     "(end_date >= ? AND end_date <= ?) OR "
        #     "(start_date <= ? AND end_date >= ?))",
        #     [company_id, start_date, end_date, start_date, end_date, start_date, end_date]
        # )
        
        # Mock data for testing
        exposures = [
            {
                'id': 1,
                'company_id': company_id,
                'reference_number': 'REF001',
                'currency_pair': 'EURUSD',
                'amount': 500000,
                'start_date': start_date,
                'end_date': end_date,
                'period_days': (datetime.strptime(end_date, '%Y-%m-%d') - datetime.strptime(start_date, '%Y-%m-%d')).days,
                'status': 'active'
            }
        ]
        
        return exposures
    
    def generate_template(self, format: str = 'csv') -> bytes:
        """
        Generate a template file for users to fill in
        
        Args:
            format: 'csv' or 'xlsx'
            
        Returns:
            Template file as bytes
        """
        
        template_data = {
            'reference': ['REF001', 'REF002', 'REF003'],
            'currency': ['EURUSD', 'GBPUSD', 'USDJPY'],
            'amount': [100000, 250000, 500000],
            'start_date': ['2025-01-15', '2025-01-20', '2025-02-01'],
            'end_date': ['2025-04-15', '2025-05-20', '2025-06-01'],
            'description': ['Q1 Payment', 'Supplier Invoice', 'Customer Receipt']
        }
        
        df = pd.DataFrame(template_data)
        
        if format == 'csv':
            buffer = io.StringIO()
            df.to_csv(buffer, index=False)
            return buffer.getvalue().encode('utf-8')
        
        elif format == 'xlsx':
            buffer = io.BytesIO()
            with pd.ExcelWriter(buffer, engine='openpyxl') as writer:
                df.to_excel(writer, index=False, sheet_name='Exposures')
                
                # Add instructions sheet
                instructions = pd.DataFrame({
                    'Field': ['reference', 'currency', 'amount', 'start_date', 'end_date', 'description'],
                    'Description': [
                        'Unique reference number or ID',
                        'Currency pair (e.g., EURUSD, GBPUSD)',
                        'Exposure amount in base currency',
                        'Start date (YYYY-MM-DD format)',
                        'End date / maturity date (YYYY-MM-DD)',
                        'Optional description or notes'
                    ],
                    'Required': ['Yes', 'Yes', 'Yes', 'Yes', 'Yes', 'No'],
                    'Example': ['INV-2025-001', 'EURUSD', '1000000', '2025-01-15', '2025-04-15', 'Q1 Payment']
                })
                
                instructions.to_excel(writer, index=False, sheet_name='Instructions')
            
            return buffer.getvalue()


# Example usage and testing
if __name__ == "__main__":
    service = ExposureDataService()
    
    # Example 1: Manual entry
    print("=" * 60)
    print("EXAMPLE 1: Manual Exposure Entry")
    print("=" * 60)
    
    result = service.create_manual_exposure(
        company_id=1,
        reference_number="REF-2025-001",
        currency_pair="EURUSD",
        amount=1000000,
        start_date="2025-01-15",
        end_date="2025-04-15",
        description="Q1 Supplier Payment"
    )
    
    if result['success']:
        print(f"✓ Exposure created successfully")
        print(f"  Reference: {result['exposure']['reference_number']}")
        print(f"  Currency: {result['exposure']['currency_pair']}")
        print(f"  Amount: ${result['exposure']['amount']:,.2f}")
        print(f"  Period: {result['exposure']['period_days']} days")
    else:
        print(f"✗ Error: {result['errors']}")
    
    # Example 2: Generate template
    print("\n" + "=" * 60)
    print("EXAMPLE 2: Generate CSV Template")
    print("=" * 60)
    
    template_csv = service.generate_template('csv')
    print(f"Template generated: {len(template_csv)} bytes")
    print("First few lines:")
    print(template_csv.decode('utf-8')[:200])
    
    # Example 3: Parse CSV (simulate)
    print("\n" + "=" * 60)
    print("EXAMPLE 3: Parse CSV File")
    print("=" * 60)
    
    # Use the template as test data
    result = service.parse_uploaded_file(
        file_content=template_csv,
        filename='exposures.csv',
        company_id=1
    )
    
    if result['success']:
        print(f"✓ File parsed successfully")
        print(f"  Filename: {result['filename']}")
        print(f"  Rows processed: {result['row_count']}")
        print(f"\nSummary:")
        print(f"  Total Amount: ${result['summary']['total_amount']:,.2f}")
        print(f"  Unique Currencies: {result['summary']['unique_currencies']}")
        print(f"  Currencies: {', '.join(result['summary']['currencies'])}")
        print(f"  Date Range: {result['summary']['earliest_start_date']} to {result['summary']['latest_end_date']}")
    else:
        print(f"✗ Error: {result['error']}")
