import { parseHash } from '@/lib/router';

export const parseRoute = () => ({ level: parseHash().params.get('level') });
