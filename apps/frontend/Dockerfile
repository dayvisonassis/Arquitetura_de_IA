FROM node:22.13.0-alpine@sha256:f2dc6eea95f787e25f173ba9904c9d0647ab2506178c7b5b7c5a3d02bc4af145 AS development

WORKDIR /app
ENV NODE_ENV=development
ENV NG_CLI_ANALYTICS=false

COPY .npmrc /usr/local/etc/npmrc

EXPOSE 4200
