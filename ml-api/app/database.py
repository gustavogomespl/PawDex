from __future__ import annotations

from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from pgvector.psycopg import register_vector
from psycopg import Connection
from psycopg.rows import dict_row
from psycopg_pool import ConnectionPool


def configure_connection(connection: Connection[Any]) -> None:
    register_vector(connection)


def create_pool(database_url: str) -> ConnectionPool:
    return ConnectionPool(
        database_url,
        min_size=1,
        max_size=5,
        open=False,
        kwargs={"row_factory": dict_row},
        configure=configure_connection,
    )


@contextmanager
def connection_from_pool(pool: ConnectionPool) -> Iterator[Connection[Any]]:
    with pool.connection() as connection:
        yield connection
