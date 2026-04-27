FROM python:3.11-slim

# Data-processing libraries. No network-calling libraries with credentials —
# requests is included for response parsing (BeautifulSoup needs it for some
# parsers) but the container runs with --network none so outbound calls fail.
RUN pip install --no-cache-dir \
    beautifulsoup4==4.12.3 \
    lxml==5.2.2 \
    pandas==2.2.2 \
    requests==2.32.3

# /sandbox is the working directory and the mount point for scripts.
WORKDIR /sandbox

# No ENTRYPOINT — the caller supplies `python -u /sandbox/script.py`.
