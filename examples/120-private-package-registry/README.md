# Example 120: Private Package Registry with Verdaccio

This example demonstrates a professional, robust, and scalable pattern for managing internal libraries (like `syntropylog`) within a microservices architecture. Instead of relying on local file paths (`file:../..`), we publish the library to a private npm registry and consume it like any other package.

## The "Why"

As a project grows, managing dependencies via file paths becomes brittle and error-prone. It creates tight coupling and makes versioning difficult. Publishing to a private registry solves these problems:

- **Total Decoupling**: Services are completely independent of the library's source code.
- **Robust Versioning**: You can control exactly which version of the library a service uses.
- **Simplified Builds**: Docker builds for services become faster and much simpler.
- **Mirrors Production**: This setup closely mimics how enterprise-grade systems are managed.

We use **Verdaccio**, a lightweight, open-source private npm registry that is perfect for local development and can be run easily within Docker.

## The "How-To"

Follow these steps to see the pattern in action.

### Step 1: Build the `syntropylog` Library

First, you need a distributable version of the library. From the **root of the monorepo**, run the build command:

```bash
npm run build
```

This will create the `dist` folder in the project root, which contains the JavaScript files that will be published.

### Step 2: Start the Private Registry

Navigate to this directory (`examples/120-private-package-registry`) and start Verdaccio using Docker Compose:

```bash
docker compose up -d verdaccio
```

The `-d` flag runs it in detached mode. You will see a `verdaccio_registry` container running. It is now ready to accept packages.

### Step 3: Publish the Library to the Private Registry

Now, publish the built library to your local Verdaccio instance. From the **root of the monorepo**, run:

```bash
# The --registry flag tells npm where to publish the package.
# The default port for Verdaccio is 4873.
npm publish --registry http://localhost:4873
```

You should see a success message indicating that `syntropylog@<version>` has been published. You can verify this by opening `http://localhost:4873` in your browser.

### Step 4: Build and Run the Consumer App

Now that the library is available in our private registry, we can build and run the `consumer-app` which depends on it.

From this directory (`examples/120-private-package-registry`), run:

```bash
docker compose up --build consumer-app
```

Docker will now build the `consumer-app`. During the build, it will execute `npm install`, and because we've configured it to use our private registry, it will fetch `syntropylog` from Verdaccio.

### Step 5: Verify the Result

The `consumer-app` is running, but it's not doing anything yet (it's running `tail -f /dev/null`). To verify that everything worked, you can `exec` into the container and see that the library was installed correctly:

```bash
docker compose exec consumer-app sh -c "ls -l /app/node_modules/syntropylog"
```

This command should show the contents of the `syntropylog` package, proving it was successfully installed from your private registry.

From here, you can modify `consumer-app/index.js` to actually use the library's functions. 