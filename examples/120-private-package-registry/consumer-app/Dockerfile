FROM node:18-alpine

WORKDIR /app

# Copia los manifiestos y el archivo de configuración del registry.
# NO se ejecuta `npm install` aquí, ya que se hará en tiempo de ejecución.
COPY package*.json .npmrc ./

# Copia el resto del código de la aplicación.
COPY . .