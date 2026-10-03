#!/bin/bash

# Function to increment version
increment_version() {
    local version=$1
    local increment_type=$2

    IFS='.' read -ra version_parts <<< "$version"
    local major="${version_parts[0]}"
    local minor="${version_parts[1]}"
    local patch="${version_parts[2]}"

    if [ "$increment_type" == "minor" ]; then
        minor=$((minor + 1))
        patch=0
    elif [ "$increment_type" == "patch" ]; then
        patch=$((patch + 1))
    else
        echo "Invalid increment type. Use 'minor' or 'patch'."
        exit 1
    fi

    echo "${major}.${minor}.${patch}"
}

# Check if an argument is provided
if [ $# -eq 0 ]; then
    echo "Please specify 'minor' or 'patch' as an argument."
    exit 1
fi

increment_type=$1

# Update package.json
current_version=$(awk -F'"' '/"version": ".+"/{ print $4; exit; }' package.json)
new_version=$(increment_version "$current_version" "$increment_type")
sed -i '' "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" package.json

echo "Updated package.json version from $current_version to $new_version"

# Update tauri.conf.json, tauri.dev.conf.json, and tauri.qa.conf.json
current_version=$(awk -F'"' '/"version": ".+"/{ print $4; exit; }' src-tauri/tauri.conf.json)
new_version=$(increment_version "$current_version" "$increment_type")
sed -i '' "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" src-tauri/tauri.conf.json
sed -i '' "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" src-tauri/tauri.dev.conf.json
sed -i '' "s/\"version\": \"$current_version\"/\"version\": \"$new_version\"/" src-tauri/tauri.qa.conf.json

echo "Updated tauri configs version from $current_version to $new_version"

echo "Version bump complete!"
