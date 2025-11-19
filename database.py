import os
from pymongo import MongoClient

# MongoDB connection URI; default to internal docker network 'mongo' service
MONGO_URI = os.environ.get("MONGO_URI", "mongodb://mongo:27017")

_client: MongoClient | None = None


def get_client() -> MongoClient:
    """Create (or return existing) synchronous MongoDB client."""
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI)
    return _client


def get_db():
    """Return the database instance."""
    client = get_client()
    return client["nerve_sim"]
