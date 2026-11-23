from __future__ import annotations

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

Day = Literal["mon", "tue", "wed", "thu", "fri", "sat"]
Cell = Literal["ON", "OL", "OF"]
TimeBin = Literal["0708", "0810", "1012", "1214", "1416", "1618", "1820", "2022", "2224"]


class StrictModel(BaseModel):
    model_config = ConfigDict(extra="forbid")


class Preferences(StrictModel):
    commute_minutes: Annotated[float, Field(ge=0, le=1440)]
    preferred_break_minutes: Annotated[float, Field(ge=0, le=1440)]
    back_to_back_tolerance: Annotated[float, Field(ge=0, le=6)]
    preferred_modality: Literal["Onsite", "Online", "No Preference"]
    preferred_days: dict[Day, bool]
    avoided_days: dict[Day, bool]
    preferred_time_bins: dict[TimeBin, bool]
    avoided_time_bins: dict[TimeBin, bool]

    @field_validator("preferred_days", "avoided_days")
    @classmethod
    def complete_days(cls, value: dict[str, bool]) -> dict[str, bool]:
        if set(value) != {"mon", "tue", "wed", "thu", "fri", "sat"}:
            raise ValueError("all six supported weekdays must be provided")
        return value

    @field_validator("preferred_time_bins", "avoided_time_bins")
    @classmethod
    def complete_time_bins(cls, value: dict[str, bool]) -> dict[str, bool]:
        if set(value) != {"0708", "0810", "1012", "1214", "1416", "1618", "1820", "2022", "2224"}:
            raise ValueError("all nine time bins must be provided")
        return value


class Context(StrictModel):
    occupancy: dict[Day, list[Cell]]
    preferences: Preferences
    warnings: list[str] = Field(default_factory=list, max_length=20)

    @field_validator("occupancy")
    @classmethod
    def complete_hourly_grid(cls, value: dict[str, list[str]]) -> dict[str, list[str]]:
        if set(value) != {"mon", "tue", "wed", "thu", "fri", "sat"}:
            raise ValueError("occupancy must include Monday through Saturday")
        if any(len(hours) != 15 for hours in value.values()):
            raise ValueError("each day must include hourly cells from 07:00 through 21:00")
        return value


class Meeting(StrictModel):
    duration_minutes: Annotated[int, Field(ge=60, le=900)]
    modality: Literal["onsite", "online"]
    type: Literal["project", "event", "meeting"]

    @field_validator("duration_minutes")
    @classmethod
    def whole_hour_duration(cls, value: int) -> int:
        if value % 60:
            raise ValueError("duration_minutes must be a whole number of hours")
        return value


class RankRequest(StrictModel):
    context: Context
    meeting: Meeting
    limit: Annotated[int, Field(default=5, ge=1, le=20)]


class Recommendation(StrictModel):
    weekday: str
    start_time: str
    end_time: str
    score: float | None


class ModelInfo(StrictModel):
    name: str
    version: str


class RankResponse(StrictModel):
    recommendations: list[Recommendation]
    model: ModelInfo
    warnings: list[str]
