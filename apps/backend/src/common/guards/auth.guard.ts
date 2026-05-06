import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { verify } from "jsonwebtoken";

interface TokenPayload {
  sub: string;
  email: string;
}

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly config: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader?.startsWith("Bearer ")) {
      throw new UnauthorizedException("Missing bearer token");
    }

    const token = authHeader.replace("Bearer ", "");

    try {
      const payload = verify(token, this.config.getOrThrow<string>("JWT_SECRET")) as TokenPayload;
      request.user = { id: payload.sub, email: payload.email };
    } catch {
      throw new UnauthorizedException("Invalid or expired token");
    }

    return true;
  }
}
