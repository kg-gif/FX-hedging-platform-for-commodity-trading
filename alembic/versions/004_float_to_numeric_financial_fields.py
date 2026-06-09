"""float to numeric for all financial fields

Revision ID: 004_float_to_numeric_financial_fields
Revises: 003_add_simulation_results_table
Create Date: 2026-06-08 00:00:00.000000

Rationale:
  Python float uses IEEE 754 binary representation which cannot represent
  decimal fractions exactly. This causes rounding errors in financial calculations.
  All money amounts, FX rates, and percentages must use Numeric (DECIMAL in PostgreSQL)
  which stores exact decimal values.

  This migration changes all affected columns in the exposures and fx_rates tables.
  The application layer already uses Decimal correctly — this aligns the ORM model
  column types with that requirement.

  Approved by: Axel · CTO, 08/06/2026
  Low urgency — not causing current failures but required before public launch.
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '004_float_to_numeric_financial_fields'
down_revision = '003_add_simulation_results_table'
branch_labels = None
depends_on = None


def upgrade():
    # --- exposures table ---

    # Money amounts: Numeric(20, 6) — supports large FX exposures with sub-cent precision
    op.alter_column('exposures', 'amount',
        type_=sa.Numeric(20, 6),
        existing_type=sa.Float(),
        existing_nullable=False)

    op.alter_column('exposures', 'current_value_usd',
        type_=sa.Numeric(20, 6),
        existing_type=sa.Float(),
        existing_nullable=True)

    op.alter_column('exposures', 'max_loss_limit',
        type_=sa.Numeric(20, 6),
        existing_type=sa.Float(),
        existing_nullable=True)

    op.alter_column('exposures', 'target_profit',
        type_=sa.Numeric(20, 6),
        existing_type=sa.Float(),
        existing_nullable=True)

    op.alter_column('exposures', 'current_pnl',
        type_=sa.Numeric(20, 6),
        existing_type=sa.Float(),
        existing_nullable=True)

    op.alter_column('exposures', 'hedged_amount',
        type_=sa.Numeric(20, 6),
        existing_type=sa.Float(),
        existing_nullable=True)

    op.alter_column('exposures', 'unhedged_amount',
        type_=sa.Numeric(20, 6),
        existing_type=sa.Float(),
        existing_nullable=True)

    # FX rates: Numeric(12, 6) — sufficient for all major and minor pairs
    op.alter_column('exposures', 'initial_rate',
        type_=sa.Numeric(12, 6),
        existing_type=sa.Float(),
        existing_nullable=True)

    op.alter_column('exposures', 'current_rate',
        type_=sa.Numeric(12, 6),
        existing_type=sa.Float(),
        existing_nullable=True)

    op.alter_column('exposures', 'budget_rate',
        type_=sa.Numeric(12, 6),
        existing_type=sa.Float(),
        existing_nullable=True)

    # Ratios / percentages: Numeric(5, 4) — e.g., 0.6000 for 60%
    op.alter_column('exposures', 'hedge_ratio_policy',
        type_=sa.Numeric(5, 4),
        existing_type=sa.Float(),
        existing_nullable=True)

    # --- companies table ---
    # trading_volume_monthly — money volume, less critical but consistent
    op.alter_column('companies', 'trading_volume_monthly',
        type_=sa.Numeric(20, 2),
        existing_type=sa.Float(),
        existing_nullable=True)

    # --- fx_rates table ---
    op.alter_column('fx_rates', 'rate',
        type_=sa.Numeric(12, 6),
        existing_type=sa.Float(),
        existing_nullable=False)


def downgrade():
    # Revert all columns back to Float
    # Note: downgrade will lose precision gained by Numeric — only run in emergency

    op.alter_column('exposures', 'amount',
        type_=sa.Float(), existing_type=sa.Numeric(20, 6), existing_nullable=False)
    op.alter_column('exposures', 'current_value_usd',
        type_=sa.Float(), existing_type=sa.Numeric(20, 6), existing_nullable=True)
    op.alter_column('exposures', 'max_loss_limit',
        type_=sa.Float(), existing_type=sa.Numeric(20, 6), existing_nullable=True)
    op.alter_column('exposures', 'target_profit',
        type_=sa.Float(), existing_type=sa.Numeric(20, 6), existing_nullable=True)
    op.alter_column('exposures', 'current_pnl',
        type_=sa.Float(), existing_type=sa.Numeric(20, 6), existing_nullable=True)
    op.alter_column('exposures', 'hedged_amount',
        type_=sa.Float(), existing_type=sa.Numeric(20, 6), existing_nullable=True)
    op.alter_column('exposures', 'unhedged_amount',
        type_=sa.Float(), existing_type=sa.Numeric(20, 6), existing_nullable=True)
    op.alter_column('exposures', 'initial_rate',
        type_=sa.Float(), existing_type=sa.Numeric(12, 6), existing_nullable=True)
    op.alter_column('exposures', 'current_rate',
        type_=sa.Float(), existing_type=sa.Numeric(12, 6), existing_nullable=True)
    op.alter_column('exposures', 'budget_rate',
        type_=sa.Float(), existing_type=sa.Numeric(12, 6), existing_nullable=True)
    op.alter_column('exposures', 'hedge_ratio_policy',
        type_=sa.Float(), existing_type=sa.Numeric(5, 4), existing_nullable=True)
    op.alter_column('companies', 'trading_volume_monthly',
        type_=sa.Float(), existing_type=sa.Numeric(20, 2), existing_nullable=True)
    op.alter_column('fx_rates', 'rate',
        type_=sa.Float(), existing_type=sa.Numeric(12, 6), existing_nullable=False)
