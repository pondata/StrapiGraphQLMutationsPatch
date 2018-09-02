#! /bin/bash
if [ -z ${1+x} ]; then
  echo "usage: "$0 "[YOUR_STRAPI_PROJEFCT_DIR]"
else
  if [ -d "$1" ]; then
    echo $'\xF0\x9F\x86\x95'"  Installing Strapi GraphQL Mutations Patch (Unstable PR#1650)"
    echo ""
    echo $'\xF0\x9F\x93\x84'"  Copying patch files to:" $1
    cp -R node_modules $1 && cp -R plugins $1
    echo $'\xF0\x9F\x91\xB7'"  Installing node dependencies..."
    cd $1
    cd plugins/graphql
    npm install --save apollo-server-koa@latest && npm install --save graphql-type-json@latest
    echo $'\xF0\x9F\x92\xBB'"  Running Strapi setup scripts..."
    cd $1
    npm run setup
  else
    echo "The directory: "$1" does not exist."
  fi
fi
