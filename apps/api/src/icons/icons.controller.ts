// REST, not GraphQL, because `@iconify/react` speaks the Iconify API's URL
// shape (`GET /{prefix}.json?icons=a,b`) and pointing it at this controller
// is all the web has to do. Public: the responses are the icon sets'
// own data, identical for every caller, and the model is never consulted.
// Namespaced under /api like data-exchange so it rides the same proxy rules.
import {
  BadRequestException,
  Controller,
  Get,
  Header,
  NotFoundException,
  Param,
  Query,
} from '@nestjs/common';
import { Public } from '../auth/auth.decorators';
import { IconsService, SEARCH_LIMIT_DEFAULT } from './icons.service';

// Icons change only with a release of this API, so a day of caching is
// safe; a new release ships new ids, and the old ones stay valid.
const ONE_DAY = 'public, max-age=86400';

@Public()
@Controller('api/icons')
export class IconsController {
  constructor(private readonly icons: IconsService) {}

  @Get('collections')
  @Header('Cache-Control', ONE_DAY)
  collections() {
    return this.icons.collections();
  }

  // Not part of the Iconify API; the picker's own search.
  @Get('search')
  @Header('Cache-Control', 'public, max-age=3600')
  search(@Query('q') q = '', @Query('limit') limit?: string) {
    const parsed = limit === undefined ? SEARCH_LIMIT_DEFAULT : Number.parseInt(limit, 10);
    if (Number.isNaN(parsed)) throw new BadRequestException('limit must be a number');
    return { hits: this.icons.search(q, parsed) };
  }

  // Iconify API format. `icons` is a comma-separated list of names within
  // the collection; an unknown collection is a 404, unknown names come back
  // in `not_found`, as the public API does it.
  @Get(':prefix.json')
  @Header('Cache-Control', ONE_DAY)
  subset(@Param('prefix') prefix: string, @Query('icons') icons = '') {
    const names = icons
      .split(',')
      .map((n) => n.trim())
      .filter(Boolean);
    const data = this.icons.subset(prefix, names);
    if (!data) throw new NotFoundException(`Icon collection "${prefix}" is not served here`);
    return data;
  }
}
