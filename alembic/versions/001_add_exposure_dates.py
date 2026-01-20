"""Add start_date and end_date to exposures

Revision ID: 001
Revises: 
Create Date: 2025-01-19

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '001'
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add start_date and end_date columns to exposures table"""
    op.add_column('exposures', sa.Column('start_date', sa.Date(), nullable=True))
    op.add_column('exposures', sa.Column('end_date', sa.Date(), nullable=True))


def downgrade() -> None:
    """Remove start_date and end_date columns from exposures table"""
    op.drop_column('exposures', 'end_date')
    op.drop_column('exposures', 'start_date')