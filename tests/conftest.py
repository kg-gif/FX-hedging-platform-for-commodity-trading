import pytest
import psycopg2
import os
from sqlalchemy import create_engine, text
from sqlalchemy.orm import sessionmaker

TEST_DB_URL = os.getenv(
    "TEST_DATABASE_URL",
    "postgresql://postgres:postgres@localhost:5432/snhtest"
)

@pytest.fixture(scope="session")
def db_engine():
    engine = create_engine(TEST_DB_URL)
    yield engine
    engine.dispose()

@pytest.fixture(scope="function")
def db(db_engine):
    """Fresh session per test — rolls back after each test so tests are isolated."""
    connection = db_engine.connect()
    transaction = connection.begin()
    Session = sessionmaker(bind=connection)
    session = Session()
    yield session
    session.close()
    transaction.rollback()
    connection.close()
