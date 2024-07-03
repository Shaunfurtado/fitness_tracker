# Use the official Bun image as base
FROM oven/bun:1 AS base
WORKDIR /usr/src/app

# Install dependencies into a temporary directory
FROM base AS install
RUN mkdir -p /temp/dev
COPY package.json bun.lockb /temp/dev/
RUN cd /temp/dev && bun install --frozen-lockfile

# Install with --production (exclude devDependencies)
RUN mkdir -p /temp/prod
COPY package.json bun.lockb /temp/prod/
RUN cd /temp/prod && bun install --frozen-lockfile --production

# Copy node_modules from the temporary directory
# Then copy all (non-ignored) project files into the image
FROM base AS prerelease
COPY --from=install /temp/dev/node_modules node_modules
COPY . .

# [Optional] Run tests & build
ENV NODE_ENV=production
RUN bun test
RUN bun run build --target=bun

# Copy production dependencies and source code into the final image
FROM base AS release
COPY --from=install /temp/prod/node_modules node_modules
COPY --from=prerelease /usr/src/app/src/index.ts .
COPY --from=prerelease /usr/src/app/package.json .

# Specify the user to run the app
USER bun

# Expose the port your app runs on
EXPOSE 3000/tcp

# Set the entry point to run your application
ENTRYPOINT [ "bun", "run", "index.ts" ]
