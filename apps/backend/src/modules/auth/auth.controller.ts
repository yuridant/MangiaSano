import { BadRequestException, Body, Controller, Get, Patch, Post, Query, Req, UseGuards } from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import { z } from "zod";
import { AuthGuard } from "../../common/guards/auth.guard";
import { AuthService } from "./auth.service";

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

const registerSchema = loginSchema.extend({
  name: z.string().min(2),
  familyName: z.string().min(2).optional().or(z.literal("")),
  inviteToken: z.string().min(10).optional()
});

const refreshSchema = z.object({ refreshToken: z.string().min(20) });

const profileSchema = z.object({ name: z.string().min(2) });

const changePasswordSchema = z.object({
  currentPassword: z.string().min(8),
  newPassword: z.string().min(8)
});

const acceptInvitationSchema = z.object({ token: z.string().min(10) });

type AuthedRequest = { user: { id: string; email: string } };

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("register")
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() body: unknown) {
    return this.authService.register(registerSchema.parse(body));
  }

  @Post("login")
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  login(@Body() body: unknown) {
    return this.authService.login(loginSchema.parse(body));
  }

  @Post("refresh")
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  refresh(@Body() body: unknown) {
    const { refreshToken } = refreshSchema.parse(body);
    return this.authService.refresh(refreshToken);
  }

  @Post("logout")
  logout(@Body() body: unknown) {
    const { refreshToken } = refreshSchema.parse(body);
    return this.authService.logout(refreshToken);
  }

  @Get("me")
  @UseGuards(AuthGuard)
  me(@Req() req: AuthedRequest) {
    return this.authService.me(req.user.id);
  }

  @Patch("profile")
  @UseGuards(AuthGuard)
  updateProfile(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.authService.updateProfile(req.user.id, profileSchema.parse(body));
  }

  @Post("change-password")
  @UseGuards(AuthGuard)
  changePassword(@Req() req: AuthedRequest, @Body() body: unknown) {
    return this.authService.changePassword(req.user.id, changePasswordSchema.parse(body));
  }

  @Get("invitations/resolve")
  resolveInvitation(@Query("token") token: string | undefined) {
    if (!token) throw new BadRequestException("Token mancante.");
    return this.authService.resolveInvitation(token);
  }

  @Post("invitations/accept")
  @UseGuards(AuthGuard)
  acceptInvitation(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { token } = acceptInvitationSchema.parse(body);
    return this.authService.acceptInvitation(req.user.id, token);
  }
}
