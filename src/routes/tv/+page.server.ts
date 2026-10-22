import { env } from '$env/dynamic/private';
import { lifestyleOn } from '$lib/server/lifestyle/read';

/** The TV is client-rendered (ssr = false), but the Lifestyle Index's flag is the server's. */
export const load = () => ({ lifestyle: lifestyleOn(env) });
