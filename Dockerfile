ARG NODE_IMAGE=swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/node:20-alpine
ARG NGINX_IMAGE=swr.cn-north-4.myhuaweicloud.com/ddn-k8s/docker.io/nginx:1.27-alpine

# Step 1: install frontend dependencies and compile the Vite app.
FROM ${NODE_IMAGE} AS build
WORKDIR /app

ARG NPM_REGISTRY=https://registry.npmmirror.com
ENV NPM_CONFIG_REGISTRY=${NPM_REGISTRY}
ENV GOPROXY=https://goproxy.cn,direct

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

# Step 2: serve the compiled dist/ files with Nginx.
FROM ${NGINX_IMAGE}

COPY nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
