import {
  BadRequestException,
  ConflictException,
  Injectable,
  UnauthorizedException
} from "@nestjs/common";
import { compare, hash } from "bcryptjs";
import { randomBytes } from "node:crypto";
import { sign } from "jsonwebtoken";
import { ConfigService } from "@nestjs/config";
import { PrismaService } from "../../prisma/prisma.service";

const ACCESS_TOKEN_TTL = "15m";
const REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  private signToken(userId: string, email: string) {
    return sign({ sub: userId, email }, this.config.getOrThrow("JWT_SECRET"), {
      expiresIn: ACCESS_TOKEN_TTL
    });
  }

  private async createRefreshToken(userId: string) {
    const token = randomBytes(40).toString("hex");
    await this.prisma.refreshToken.create({
      data: { token, userId, expiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS) }
    });
    return token;
  }

  async register(payload: {
    name: string;
    email: string;
    password: string;
    familyName?: string;
    inviteToken?: string;
  }) {
    const email = payload.email.toLowerCase();

    const existing = await this.prisma.user.findUnique({ where: { email } });
    if (existing) throw new ConflictException("Email già in uso");

    if (payload.inviteToken) {
      const invitation = await this.getValidInvitation(payload.inviteToken);
      if (invitation.email.toLowerCase() !== email) {
        throw new BadRequestException("L'invito appartiene a un'altra email.");
      }

      const user = await this.prisma.$transaction(async (tx) => {
        const u = await tx.user.create({
          data: { name: payload.name, email, passwordHash: await hash(payload.password, 10) }
        });
        await tx.familyMembership.create({
          data: { familyId: invitation.familyId, userId: u.id, role: invitation.role }
        });
        await tx.familyInvitation.update({
          where: { id: invitation.id },
          data: { usedAt: new Date() }
        });
        return u;
      });

      const accessToken = this.signToken(user.id, user.email);
      const refreshToken = await this.createRefreshToken(user.id);
      return { accessToken, refreshToken };
    }

    const user = await this.prisma.$transaction(async (tx) => {
      const u = await tx.user.create({
        data: { name: payload.name, email, passwordHash: await hash(payload.password, 10) }
      });
      if (payload.familyName?.trim()) {
        const family = await tx.family.create({ data: { name: payload.familyName.trim() } });
        await tx.familyMembership.create({
          data: { familyId: family.id, userId: u.id, role: "owner" }
        });
      }
      return u;
    });

    const accessToken = this.signToken(user.id, user.email);
    const refreshToken = await this.createRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  async login(payload: { email: string; password: string }) {
    const user = await this.prisma.user.findUnique({
      where: { email: payload.email.toLowerCase() }
    });
    if (!user) throw new UnauthorizedException("Credenziali non valide");

    const valid = await compare(payload.password, user.passwordHash);
    if (!valid) throw new UnauthorizedException("Credenziali non valide");

    const accessToken = this.signToken(user.id, user.email);
    const refreshToken = await this.createRefreshToken(user.id);
    return { accessToken, refreshToken };
  }

  async refresh(refreshToken: string) {
    const stored = await this.prisma.refreshToken.findUnique({ where: { token: refreshToken } });
    if (!stored || stored.expiresAt < new Date()) {
      throw new UnauthorizedException("Refresh token non valido o scaduto");
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: stored.userId } });
    await this.prisma.refreshToken.delete({ where: { id: stored.id } });

    const newAccessToken = this.signToken(user.id, user.email);
    const newRefreshToken = await this.createRefreshToken(user.id);
    return { accessToken: newAccessToken, refreshToken: newRefreshToken };
  }

  async logout(refreshToken: string) {
    await this.prisma.refreshToken.deleteMany({ where: { token: refreshToken } });
    return { success: true };
  }

  async me(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, email: true, name: true }
    });

    const memberships = await this.prisma.familyMembership.findMany({
      where: { userId },
      include: {
        family: { include: { _count: { select: { memberships: true } } } }
      }
    });

    const families = memberships.map((m) => ({
      id: m.family.id,
      name: m.family.name,
      role: m.role,
      memberCount: m.family._count.memberships
    }));

    return { user, families };
  }

  async updateProfile(userId: string, data: { name: string }) {
    return this.prisma.user.update({
      where: { id: userId },
      data: { name: data.name },
      select: { id: true, email: true, name: true }
    });
  }

  async changePassword(userId: string, data: { currentPassword: string; newPassword: string }) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    const valid = await compare(data.currentPassword, user.passwordHash);
    if (!valid) throw new BadRequestException("Password corrente non corretta");

    await this.prisma.user.update({
      where: { id: userId },
      data: { passwordHash: await hash(data.newPassword, 10) }
    });

    await this.prisma.refreshToken.deleteMany({ where: { userId } });
    return { success: true };
  }

  async resolveInvitation(token: string) {
    const invitation = await this.getValidInvitation(token);
    return {
      id: invitation.id,
      familyId: invitation.familyId,
      familyName: invitation.family.name,
      email: invitation.email,
      role: invitation.role
    };
  }

  async acceptInvitation(userId: string, token: string) {
    const invitation = await this.getValidInvitation(token);

    const existing = await this.prisma.familyMembership.findUnique({
      where: { userId_familyId: { userId, familyId: invitation.familyId } }
    });
    if (existing) throw new ConflictException("Sei già membro di questa famiglia.");

    await this.prisma.$transaction(async (tx) => {
      await tx.familyMembership.create({
        data: { familyId: invitation.familyId, userId, role: invitation.role }
      });
      await tx.familyInvitation.update({
        where: { id: invitation.id },
        data: { usedAt: new Date() }
      });
    });

    return { success: true };
  }

  private async getValidInvitation(token: string) {
    const invitation = await this.prisma.familyInvitation.findUnique({
      where: { token },
      include: { family: true }
    });
    if (!invitation || invitation.usedAt || invitation.expiresAt < new Date()) {
      throw new BadRequestException("Invito non valido o scaduto.");
    }
    return invitation;
  }
}
