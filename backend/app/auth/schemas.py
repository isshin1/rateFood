from pydantic import BaseModel, EmailStr, Field


class SignInRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1)


class SignUpRequest(BaseModel):
    first_name: str = Field(alias="firstName", min_length=1)
    last_name: str = Field(alias="lastName", min_length=1)
    email: EmailStr
    password: str = Field(min_length=6)

    model_config = {"populate_by_name": True}


class JwtResponse(BaseModel):
    token: str
    roles: list[str]


class LogoutResponse(BaseModel):
    message: str
