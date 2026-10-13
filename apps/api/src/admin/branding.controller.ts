// Instance branding (D-23) over REST: the images are bytes, so they do not
// go through GraphQL. Reading is public — the sign-in page shows the logo
// before anyone is signed in — and changing is admin only. Three slots:
// `logo`, `logo-dark` (shown instead of the logo on a dark background) and
// `icon` (square; the favicon and the collapsed sidebar).
//
// The response is built to be safe as an <img> source and nothing else: a
// Content-Security-Policy that forbids scripts and a sandbox, nosniff, and
// inline disposition. The web only ever embeds it through <img>, where an
// SVG runs no script anyway; the headers cover the case of someone opening
// the URL directly.
import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  NotFoundException,
  Param,
  Put,
  Req,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { AdminOnly, Public } from '../auth/auth.decorators';
import type { InstanceAssetKind } from '../auth/auth.service';
import { AdminService } from './admin.service';

// URL slug -> stored kind.
const SLOTS: Record<string, InstanceAssetKind> = {
  logo: 'logo',
  'logo-dark': 'logo_dark',
  icon: 'icon',
};

function kindOf(slot: string): InstanceAssetKind {
  const kind = SLOTS[slot];
  if (!kind) throw new NotFoundException(`No branding slot "${slot}"`);
  return kind;
}

@Controller('api/branding')
export class BrandingController {
  constructor(private readonly admin: AdminService) {}

  // The web appends ?v=<version>, so a changed image is a new URL: a request
  // for the current version may be cached for good, anything else for an
  // hour, with the ETag to revalidate. The resource policy is opened because
  // the web may be served from another origin than the API (VITE_API_URL),
  // and an <img> is subject to it; the images are public anyway.
  @Public()
  @Get(':slot')
  async read(@Param('slot') slot: string, @Req() req: Request, @Res() res: Response) {
    const asset = await this.admin.asset(kindOf(slot));
    if (!asset) throw new NotFoundException(`This instance has no ${slot}`);
    const etag = `"${asset.version}"`;
    if (req.headers['if-none-match'] === etag) {
      res.status(304).end();
      return;
    }
    const versioned = req.query.v === asset.version;
    res
      .set({
        'Content-Type': asset.mime,
        'Content-Length': String(asset.bytes.length),
        'Content-Disposition': 'inline',
        'Cache-Control': versioned ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
        'Cross-Origin-Resource-Policy': 'cross-origin',
        'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
        'X-Content-Type-Options': 'nosniff',
        ETag: etag,
      })
      .send(asset.bytes);
  }

  // PUT with the image as the raw body (see main.ts); Content-Type names
  // the format.
  @AdminOnly()
  @Put(':slot')
  upload(@Param('slot') slot: string, @Req() req: Request) {
    const kind = kindOf(slot);
    const body: unknown = req.body;
    if (!Buffer.isBuffer(body) || body.length === 0) {
      throw new BadRequestException('Send the image file as the request body');
    }
    const mime = (req.headers['content-type'] ?? '').split(';')[0]?.trim() ?? '';
    return this.admin.setAsset(kind, body, mime);
  }

  @AdminOnly()
  @Delete(':slot')
  remove(@Param('slot') slot: string) {
    return this.admin.clearAsset(kindOf(slot));
  }
}
