import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { AuthGuard } from "../../common/guards/auth.guard";
import { FamiliesService } from "./families.service";

const createFamilySchema = z.object({ name: z.string().min(2) });
const updateNameSchema = z.object({ name: z.string().min(2) });
const inviteSchema = z.object({ email: z.string().email() });

type AuthedRequest = { user: { id: string } };

@Controller("families")
@UseGuards(AuthGuard)
export class FamiliesController {
  constructor(private readonly familiesService: FamiliesService) {}

  @Post()
  createFamily(@Req() req: AuthedRequest, @Body() body: unknown) {
    const { name } = createFamilySchema.parse(body);
    return this.familiesService.createFamily(req.user.id, name);
  }

  @Get(":familyId")
  getFamily(@Req() req: AuthedRequest, @Param("familyId") familyId: string) {
    return this.familiesService.getFamily(req.user.id, familyId);
  }

  @Patch(":familyId")
  updateName(@Req() req: AuthedRequest, @Param("familyId") familyId: string, @Body() body: unknown) {
    const { name } = updateNameSchema.parse(body);
    return this.familiesService.updateFamilyName(req.user.id, familyId, name);
  }

  @Post(":familyId/invitations")
  invite(@Req() req: AuthedRequest, @Param("familyId") familyId: string, @Body() body: unknown) {
    const { email } = inviteSchema.parse(body);
    return this.familiesService.inviteMember(req.user.id, familyId, email);
  }

  @Delete(":familyId/invitations/:invitationId")
  cancelInvitation(
    @Req() req: AuthedRequest,
    @Param("familyId") familyId: string,
    @Param("invitationId") invitationId: string
  ) {
    return this.familiesService.cancelInvitation(req.user.id, familyId, invitationId);
  }

  @Delete(":familyId/members/:memberId")
  removeMember(
    @Req() req: AuthedRequest,
    @Param("familyId") familyId: string,
    @Param("memberId") memberId: string
  ) {
    return this.familiesService.removeMember(req.user.id, familyId, memberId);
  }
}
