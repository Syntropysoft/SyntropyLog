// ARCHIVO: src/routes/userRoutes.ts (Simula ser un controlador)

// Importamos el servicio ya "listo para usar" desde nuestro contenedor.
// No sabemos cómo se hizo, solo que funciona.
import { userServiceAxios, userServiceFetch } from '../container/container';

// Imagina que esto es un endpoint de una ruta de Express/Fastify
async function handleGetUserRequest(userId: string) {
  try {
    // Podemos usar cualquiera de los servicios, la llamada es idéntica
    const userFromAxios = await userServiceAxios.getUserById(userId);
    console.log('USUARIO OBTENIDO CON AXIOS:', userFromAxios);

    // const userFromGot = await userServiceGot.getUserById(userId);
    // console.log('USUARIO OBTENIDO CON GOT:', userFromGot);

    const userFromFetch = await userServiceFetch.getUserById(userId);
    console.log('USUARIO OBTENIDO CON FETCH:', userFromFetch);
  } catch (error) {
    // ... manejar error
  }
}

handleGetUserRequest('1');
