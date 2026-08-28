FROM node:22-alpine AS build
WORKDIR /app
# node:22-alpine ships npm 10.9.x, whose arborist crashes on some peer
# graphs: "Cannot read properties of null (reading 'edgesOut')"
# (npm/cli#8261). The fix shipped in npm >= 11.6.1.
RUN npm install -g npm@11
COPY package.json ./
RUN npm install
COPY . .
RUN npm run generate

FROM nginx:alpine
COPY --from=build /app/.output/public /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
