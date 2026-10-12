// Install Git hooks for local development only. Production dependency
// closures (`pnpm install --prod`, e.g. the Docker prod-deps stage) and CI do
// not ship husky, so skip there instead of failing the install.
if (process.env.NODE_ENV === 'production' || process.env.CI === 'true') {
  process.exit(0);
}
const husky = (await import('husky')).default;
console.log(husky());
