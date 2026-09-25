import {
  IsEmail,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @Matches(/^[a-zA-Z0-9._%+-]+@gmail\.com$/i, {
    message: 'email must be a gmail.com address',
  })
  email!: string;

  @IsString()
  @MinLength(6)
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  display_name?: string;

  @IsOptional()
  @IsString()
  name?: string;

  @IsOptional()
  @IsString()
  invite_code?: string;

  @IsOptional()
  @IsString()
  referral_code?: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  country?: string;
}

export class LoginDto {
  @ValidateIf((o: LoginDto) => !o.email)
  @IsString()
  phone?: string;

  @ValidateIf((o: LoginDto) => !o.phone)
  @IsEmail()
  email?: string;

  @IsString()
  password!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  country?: string;
}

export class GoogleLoginDto {
  @IsString()
  id_token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  country?: string;

  @IsOptional()
  @IsString()
  invite_code?: string;

  @IsOptional()
  @IsString()
  referral_code?: string;
}

export class RefreshTokenDto {
  @IsString()
  refresh_token!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4)
  country?: string;
}

export class VerifyEmailOtpDto {
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  otp!: string;
}

export class ForgotPasswordDto {
  @IsEmail()
  email!: string;
}

export class ResetPasswordDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(6)
  @MaxLength(6)
  otp!: string;

  @IsString()
  @MinLength(6)
  password!: string;
}

export class ChangePasswordRequestDto {
  @IsString()
  @MinLength(6)
  new_password!: string;
}

export class ChangePasswordVerifyDto {
  @IsString()
  @MinLength(6)
  @MaxLength(6)
  otp!: string;

  @IsString()
  @MinLength(6)
  new_password!: string;
}
