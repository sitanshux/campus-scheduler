from fastapi.middleware.cors import CORSMiddleware
from fastapi import FastAPI, HTTPException

from app.core.dataset import (
    load_dataset,
    get_dataset_summary,
)
from app.scheduling.routes import router as schedule_router
from app.bookings.routes import router as booking_router
from app.examinations.routes import router as exam_router
from app.rescheduling.routes import router as reschedule_router

app = FastAPI(
    title="CIT Campus Scheduler API",
    description="Campus Scheduling and Venue Management System",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(schedule_router)
app.include_router(booking_router)
app.include_router(exam_router)
app.include_router(reschedule_router)


@app.get("/")
def root():
    return {
        "message": "CIT Campus Scheduler API is running",
        "status": "healthy",
    }


@app.get("/api/health")
def health_check():
    return {
        "status": "healthy",
        "service": "CIT Campus Scheduler Backend",
    }


@app.get("/api/dataset/summary")
def dataset_summary():
    try:
        return get_dataset_summary()
    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/api/dataset")
def dataset_info():
    try:
        dataset = load_dataset()

        return {
            "dataset_id": dataset["dataset_id"],
            "institute": dataset["institute"],
            "calendar": dataset["calendar"],
            "counts": get_dataset_summary()["counts"],
        }

    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=500, detail=str(error))


@app.get("/api/dataset/full")
def dataset_full():
    """Return the full read-only dataset records."""
    try:
        dataset = load_dataset()

        return {
            "rooms": dataset["rooms"],
            "faculty": dataset["faculty"],
            "student_groups": dataset["student_groups"],
            "courses": dataset["courses"],
            "sessions": dataset["sessions"],
            "booking_requests": dataset["booking_requests"],
            "exams": dataset["exams"],
        }

    except (FileNotFoundError, ValueError) as error:
        raise HTTPException(status_code=500, detail=str(error))
