# Minimal, cache-friendly image for running uv-developed Python projects.
FROM python:3.11-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 

# create a non-root user
RUN addgroup --system app && adduser --system --ingroup app app

WORKDIR /app

# install build deps only if needed for building wheels
RUN apt-get update \
    && apt-get install -y --no-install-recommends build-essential libffi-dev \
    && rm -rf /var/lib/apt/lists/*

# upgrade pip and install CLI tooling (uv) up-front
RUN pip install --upgrade pip
RUN pip install --no-cache-dir uv

# copy only pyproject to leverage layer caching for deps
COPY pyproject.toml pyproject.toml
# install project dependencies (PEP 517 build will be used if needed)
RUN pip install --no-cache-dir .

# copy application source
COPY . .

# ensure correct ownership
RUN chown -R app:app /app

USER app

EXPOSE 5005

# default: run the MCP REST server with the mock proxy (override CMD at runtime as needed)
CMD ["python", "main.py", "--server", "--port=5005", "--mock-proxy"]