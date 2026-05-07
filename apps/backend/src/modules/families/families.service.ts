import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createTransport } from "nodemailer";
import { PrismaService } from "../../prisma/prisma.service";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

@Injectable()
export class FamiliesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService
  ) {}

  async createFamily(userId: string, name: string) {
    const family = await this.prisma.family.create({
      data: {
        name,
        memberships: { create: { userId, role: "owner" } }
      },
      select: { id: true, name: true }
    });
    return family;
  }

  async getFamily(userId: string, familyId: string) {
    await this.requireMembership(userId, familyId);

    const family = await this.prisma.family.findUniqueOrThrow({
      where: { id: familyId },
      include: {
        memberships: {
          include: { user: { select: { id: true, name: true, email: true } } }
        },
        invitations: {
          where: { usedAt: null, expiresAt: { gt: new Date() } },
          select: { id: true, email: true, role: true, expiresAt: true }
        }
      }
    });

    return {
      id: family.id,
      name: family.name,
      members: family.memberships.map((m) => ({
        id: m.user.id,
        name: m.user.name,
        email: m.user.email,
        role: m.role,
        joinedAt: m.joinedAt
      })),
      pendingInvitations: family.invitations
    };
  }

  async updateFamilyName(userId: string, familyId: string, name: string) {
    const membership = await this.requireMembership(userId, familyId);
    if (membership.role !== "owner") throw new ForbiddenException("Solo il proprietario può modificare il nome.");

    return this.prisma.family.update({
      where: { id: familyId },
      data: { name },
      select: { id: true, name: true }
    });
  }

  async inviteMember(userId: string, familyId: string, email: string) {
    const membership = await this.requireMembership(userId, familyId);
    if (membership.role !== "owner") throw new ForbiddenException("Solo il proprietario può invitare membri.");

    const normalizedEmail = email.toLowerCase();

    const alreadyMember = await this.prisma.familyMembership.findFirst({
      where: { familyId, user: { email: normalizedEmail } }
    });
    if (alreadyMember) throw new BadRequestException("Questo utente è già membro della famiglia.");

    const existing = await this.prisma.familyInvitation.findFirst({
      where: { familyId, email: normalizedEmail, usedAt: null, expiresAt: { gt: new Date() } }
    });
    if (existing) throw new BadRequestException("Esiste già un invito attivo per questa email.");

    const invitation = await this.prisma.familyInvitation.create({
      data: {
        familyId,
        email: normalizedEmail,
        role: "member",
        expiresAt: new Date(Date.now() + INVITE_TTL_MS)
      },
      include: { family: true }
    });

    await this.sendInviteEmail(normalizedEmail, invitation.token, invitation.family.name);

    return { success: true, email: normalizedEmail };
  }

  async removeMember(userId: string, familyId: string, targetUserId: string) {
    const membership = await this.requireMembership(userId, familyId);
    if (membership.role !== "owner" && userId !== targetUserId) {
      throw new ForbiddenException("Non autorizzato.");
    }

    const targetMembership = await this.prisma.familyMembership.findUnique({
      where: { userId_familyId: { userId: targetUserId, familyId } }
    });
    if (!targetMembership) throw new NotFoundException("Membro non trovato.");
    if (targetMembership.role === "owner") throw new BadRequestException("Non puoi rimuovere il proprietario.");

    await this.prisma.familyMembership.delete({
      where: { userId_familyId: { userId: targetUserId, familyId } }
    });

    return { success: true };
  }

  async cancelInvitation(userId: string, familyId: string, invitationId: string) {
    const membership = await this.requireMembership(userId, familyId);
    if (membership.role !== "owner") throw new ForbiddenException("Solo il proprietario può annullare inviti.");

    await this.prisma.familyInvitation.deleteMany({
      where: { id: invitationId, familyId }
    });

    return { success: true };
  }

  async requireMembership(userId: string, familyId: string) {
    const membership = await this.prisma.familyMembership.findUnique({
      where: { userId_familyId: { userId, familyId } }
    });
    if (!membership) throw new ForbiddenException("Non sei membro di questa famiglia.");
    return membership;
  }

  private async sendInviteEmail(email: string, token: string, familyName: string) {
    try {
      const appUrl = this.config.get<string>("APP_URL");
      const smtpHost = this.config.get<string>("SMTP_HOST");
      const smtpPort = this.config.get<number>("SMTP_PORT");
      const smtpUser = this.config.get<string>("SMTP_USER");
      const smtpPass = this.config.get<string>("SMTP_PASS");
      const smtpFrom = this.config.get<string>("SMTP_FROM");
      if (!appUrl || !smtpHost || !smtpPort || !smtpUser || !smtpPass || !smtpFrom) return;

      const inviteUrl = `${appUrl}/invite/${token}`;

      const transporter = createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: this.config.get<boolean>("SMTP_SECURE"),
        auth: {
          user: smtpUser,
          pass: smtpPass
        }
      });

      await transporter.sendMail({
        from: smtpFrom,
        to: email,
        subject: `Sei stato invitato a ${familyName} su MangiaSano`,
        text: `Accetta l'invito: ${inviteUrl}`,
        html: `<p>Sei stato invitato a unirti alla famiglia <strong>${familyName}</strong> su MangiaSano.</p>
               <p><a href="${inviteUrl}">Accetta l'invito</a></p>
               <p>Il link scade tra 7 giorni.</p>`
      });
    } catch {
      // Email failure non blocca l'operazione
    }
  }
}
