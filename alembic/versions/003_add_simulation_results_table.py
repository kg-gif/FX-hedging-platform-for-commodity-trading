"""Add simulation_results table

Revision ID: 003
Revises: 002
Create Date: 2026-02-06

"""
from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = '003'
down_revision = '002'
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Create simulation_results table"""
    op.create_table(
        'simulation_results',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('exposure_id', sa.Integer(), nullable=False),
        sa.Column('created_at', sa.DateTime(), nullable=True),
        sa.Column('horizon_days', sa.Integer(), nullable=False),
        sa.Column('num_scenarios', sa.Integer(), nullable=False),
        sa.Column('volatility', sa.Numeric(precision=6, scale=4), nullable=False),
        sa.Column('current_rate', sa.Numeric(precision=10, scale=6), nullable=False),
        sa.Column('var_95', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('var_99', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('expected_pnl', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('max_loss', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('max_gain', sa.Numeric(precision=15, scale=2), nullable=True),
        sa.Column('probability_of_loss', sa.Numeric(precision=5, scale=4), nullable=True),
        sa.Column('pnl_distribution', sa.JSON(), nullable=True),
        sa.Column('rate_distribution', sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(['exposure_id'], ['exposures.id'], ),
        sa.PrimaryKeyConstraint('id')
    )
    op.create_index(op.f('ix_simulation_results_id'), 'simulation_results', ['id'], unique=False)


def downgrade() -> None:
    """Drop simulation_results table"""
    op.drop_index(op.f('ix_simulation_results_id'), table_name='simulation_results')
    op.drop_table('simulation_results')
