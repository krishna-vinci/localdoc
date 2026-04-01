FROM python:3.11-slim

WORKDIR /app

# Install system dependencies
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Install uv for faster package management
RUN pip install uv

# Copy requirements
COPY pyproject.toml .

# Install dependencies
RUN uv sync --frozen

# Copy application code
COPY . .

EXPOSE 4320

# Run with uvicorn in development mode with hot reload
CMD ["uv", "run", "uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "4320", "--reload"]
