FROM node:22-alpine

WORKDIR /app

# Copy package files
COPY package.json package-lock.json* ./

# Install dependencies
RUN npm install

# Copy source
COPY . .

EXPOSE 4321

# Next.js dev server with hot reload
CMD ["npm", "run", "dev"]
