"""add fx_rates table and instrument_type column

Revision ID: 002_add_fx_rates_and_instrument_type
Revises: 001_add_exposure_dates
Create Date: 2026-02-05 00:00:00.000000
"""
from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = '002_add_fx_rates_and_instrument_type'
down_revision = '001_add_exposure_dates'
branch_labels = None
depends_on = None


def upgrade():
    # Create fx_rates table
    op.create_table(
        'fx_rates',
        sa.Column('id', sa.Integer(), primary_key=True, nullable=False),
        sa.Column('currency_pair', sa.String(length=7), nullable=False),
        sa.Column('rate', sa.Float(), nullable=False),
        sa.Column('timestamp', sa.DateTime(), nullable=False),
        sa.Column('source', sa.String(length=50), nullable=True)
    )

    # Add instrument_type column to exposures
    op.add_column('exposures', sa.Column('instrument_type', sa.String(length=20), nullable=True))


def downgrade():
    # Remove instrument_type column
    op.drop_column('exposures', 'instrument_type')

    # Drop fx_rates table
    op.drop_table('fx_rates')
