FROM python:3.12-slim

# Upgrade OS packages to patch known CVEs before adding anything else
RUN apt-get update && apt-get upgrade -y && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

# Pin uv to a specific version — never use :latest in production images
COPY --from=ghcr.io/astral-sh/uv:0.9.17 /uv /uvx /bin/

WORKDIR /app

# Copy dependency files first for layer caching
COPY pyproject.toml uv.lock ./

# Install dependencies exactly as locked — no network surprises
RUN uv sync --frozen --no-dev

COPY backend/ ./backend/

CMD ["uv", "run", "uvicorn", "backend.main:app", "--host", "0.0.0.0", "--port", "8000"]
