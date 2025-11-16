# Stage 1: Build dependencies
# Use a specific Node.js LTS version for reproducibility
FROM node:20-slim AS builder

# Set the working directory in the container
WORKDIR /app

# Copy package manifests and install dependencies
COPY package.json package-lock.json ./
RUN npm ci

# Stage 2: Create the production image
# Use the same slim base image
FROM node:20-slim

# Set the working directory for the final image
WORKDIR /app

# The official Node.js images create a 'node' user that we can use for security.
USER node

# Copy the package manifests
COPY --chown=node:node package.json package-lock.json ./

# Copy installed dependencies from the builder stage
COPY --from=builder /app/node_modules ./node_modules

# Copy the application source code
COPY --chown=node:node src ./src
COPY --chown=node:node public ./public

# Expose the port the application will run on
EXPOSE 8080

# Command to start the application, using the script from package.json
CMD ["npm", "start"]
