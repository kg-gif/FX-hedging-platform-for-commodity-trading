import pandas as pd
from io import BytesIO
from typing import Dict, List, Tuple
from sqlalchemy.orm import Session
from models import APExposure, Tenant
import uuid
from datetime import datetime

# Column mapping: Norwegian → English
COLUMN_MAPPING = {
    'Bestillingsnr.': 'order_number',
    'Betalings-betingelser': 'payment_terms',
    'Fakturanr.': 'invoice_number',
    'Opprettelsesdato bestilling': 'order_date',
    'Fakturadato': 'invoice_date',
    'Forfallsdato': 'due_date',
    'Kredit': 'amount',
    'Valuta': 'currency',
    'Leverandør': 'supplier'
}


async def parse_csv(file_content: bytes) -> pd.DataFrame:
    """Parse uploaded CSV file with Norwegian column headers"""
    try:
        df = pd.read_csv(BytesIO(file_content), encoding='utf-8', skipinitialspace=True)
        df = df.rename(columns=COLUMN_MAPPING)
        
        # Convert date columns
        date_columns = ['order_date', 'invoice_date', 'due_date']
        for col in date_columns:
            if col in df.columns:
                df[col] = pd.to_datetime(df[col], errors='coerce')
        
        df['amount'] = pd.to_numeric(df['amount'], errors='coerce')
        return df
    except Exception as e:
        raise ValueError(f"Failed to parse CSV: {str(e)}")


def get_supplier_history(tenant_id: str, supplier: str, db: Session) -> int:
    """Count historical invoices for a supplier"""
    count = db.query(APExposure).filter(
        APExposure.tenant_id == tenant_id,
        APExposure.supplier == supplier
    ).count()
    return count


def classify_exposure(row: Dict, supplier_count: int) -> Dict:
    """Classify exposure based on data completeness"""
    has_invoice = pd.notna(row.get('invoice_number'))
    has_due_date = pd.notna(row.get('due_date'))
    
    if has_invoice and has_due_date:
        confidence_level = "committed"
        confidence_score = 0.95
        reasoning = "Invoice exists with fixed due date"
        
        is_recurring = supplier_count >= 100
        if is_recurring:
            confidence_score = 0.85
            reasoning += f"; Recurring supplier ({supplier_count} historical invoices)"
        else:
            is_recurring = False
    else:
        confidence_level = "forecast"
        confidence_score = 0.50
        is_recurring = False
        reasoning = "Missing invoice or due date - forecasted exposure"
    
    return {
        "confidence_level": confidence_level,
        "confidence_score": confidence_score,
        "is_recurring": is_recurring,
        "reasoning": reasoning
    }


async def process_exposures(
    df: pd.DataFrame,
    tenant_id: str,
    uploaded_by: str,
    source_file: str,
    db: Session
) -> Tuple[List[Dict], Dict]:
    """Process DataFrame and classify all exposures"""
    classified_exposures = []
    supplier_cache = {}
    
    for _, row in df.iterrows():
        if pd.isna(row.get('amount')) or pd.isna(row.get('currency')):
            continue
        
        supplier = row.get('supplier', 'Unknown')
        
        if supplier not in supplier_cache:
            supplier_cache[supplier] = get_supplier_history(tenant_id, supplier, db)
        supplier_count = supplier_cache[supplier]
        
        classification = classify_exposure(row.to_dict(), supplier_count)
        
        exposure_data = {
    "tenant_id": tenant_id,
    "order_number": row.get('order_number'),
    "invoice_number": row.get('invoice_number'),
    "supplier": supplier,
    "amount": float(row['amount']),
    "currency": row['currency'],
    "order_date": row.get('order_date').isoformat() if pd.notna(row.get('order_date')) else None,
    "invoice_date": row.get('invoice_date').isoformat() if pd.notna(row.get('invoice_date')) else None,
    "due_date": row.get('due_date').isoformat() if pd.notna(row.get('due_date')) else None,
    "payment_terms": row.get('payment_terms'),
    "confidence_level": classification['confidence_level'],
    "confidence_score": float(classification['confidence_score']),
    "is_recurring": classification['is_recurring'],
    "reasoning": classification['reasoning'],
    "uploaded_by": uploaded_by,
    "source_file_name": source_file
}
        
        classified_exposures.append(exposure_data)
    
    summary = generate_summary(classified_exposures)
    return classified_exposures, summary


def generate_summary(exposures: List[Dict]) -> Dict:
    """Generate summary statistics from classified exposures"""
    df = pd.DataFrame(exposures)
    
    currency_summary = df.groupby('currency').agg({
        'amount': ['count', 'sum']
    }).to_dict()
    
    classification_summary = {
        'committed': len(df[df['confidence_level'] == 'committed']),
        'probable': len(df[df['confidence_level'] == 'probable']),
        'forecast': len(df[df['confidence_level'] == 'forecast']),
        'recurring_suppliers': len(df[df['is_recurring'] == True])
    }
    
    return {
        "total_rows": len(exposures),
        "currencies": currency_summary,
        "classification": classification_summary
    }


async def bulk_insert_exposures(exposures: List[Dict], db: Session) -> int:
    """
    Bulk insert exposures into database with batch processing
    """
    try:
        # Deduplicate within the batch first
        seen = set()
        unique_exposures = []
        duplicates_skipped = 0
        
        for exposure in exposures:
            key = (exposure['tenant_id'], exposure.get('invoice_number'))
            
            if key not in seen:
                seen.add(key)
                unique_exposures.append(exposure)
            else:
                duplicates_skipped += 1
        
        if duplicates_skipped > 0:
            print(f"⚠️  Skipped {duplicates_skipped} duplicate invoices within CSV")
        
        # Use bulk_insert_mappings for much faster insertion
        from sqlalchemy import insert
        
        # Insert in batches of 500 to avoid overwhelming the database
        batch_size = 500
        inserted_count = 0
        
        for i in range(0, len(unique_exposures), batch_size):
            batch = unique_exposures[i:i + batch_size]
            
            try:
                # Use insert().on_conflict_do_nothing() for PostgreSQL
                stmt = insert(APExposure).values(batch)
                # Skip duplicates that exist in database
                stmt = stmt.on_conflict_do_nothing(
                    index_elements=['tenant_id', 'invoice_number']
                )
                db.execute(stmt)
                db.commit()
                inserted_count += len(batch)
                print(f"📦 Inserted batch {i//batch_size + 1} ({len(batch)} records)")
                
            except Exception as e:
                db.rollback()
                print(f"⚠️  Error in batch {i//batch_size + 1}: {str(e)}")
                continue
        
        print(f"✅ Successfully inserted {inserted_count} records")
        return inserted_count
        
    except Exception as e:
        db.rollback()
        raise ValueError(f"Failed to insert exposures: {str(e)}")