FROM denoland/deno:2.6.3
WORKDIR /app
COPY deno.json deno.lock ./
COPY src ./src
RUN deno cache --unstable-kv --unstable-cron src/main.ts
COPY drizzle ./drizzle
RUN mkdir -p /data/uploads && chown -R deno:deno /data /app
USER deno
ENV PORT=8000 DATABASE_URL=file:/data/tasks.db APP_ENV=production UPLOAD_DIR=/data/uploads POOL_SIZE=3
EXPOSE 8000
CMD ["run", "--unstable-kv", "--unstable-cron", "--allow-net", "--allow-env", "--allow-read", "--allow-write", "--allow-ffi", "--allow-sys", "src/main.ts"]
