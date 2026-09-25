from fastapi import FastAPI

app = FastAPI(title="Algoverve Historical Data backend")


@app.get("/")
def read_root():
    return {
        "status": "online",
        "message": "Algoverve Historical Data backend is running",
    }


@app.get("/health")
def health_check():
    return {"status": "healthy"}
