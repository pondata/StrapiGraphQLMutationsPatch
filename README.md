# Strapi GraphQL Mutations Patch (Unstable PR#1650)

> ⚠️ This patch requires the GraphQL plugin (not installed by default).

> ⚠️ This patch is unstable as it is not fully tested, follow [PR#1650](https://github.com/strapi/strapi/pull/1650) for more information.

## Usage

To get started with GraphQL in your app, please install the plugin first. To do that, open your terminal and run the following command in your strapi project directory:

```
strapi install graphql
```

Then you will need to patch the project by going to the directory with the `install.bash` file and run the following command:

```
./install.bash YOUR_STRAPI_PROJECT_DIR
```

Once it is the patch process is complete, you can now use GraphQL mutations in your strapi project.

## Known Issues

- When using the built-in GraphQL Playground, there is no cursor.
- The GraphQL Playground does not apply user settings.
