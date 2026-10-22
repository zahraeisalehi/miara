> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Create a app

> create app that user owns



## OpenAPI

````yaml /spec/paas.yaml post /v1/projects
openapi: 3.0.1
info:
  title: PaaS
  description: >-
    Manage your apps using our API


    [wss://api.liara.ir?token=<api-token>&cmd=/bin/bash&project_id=<project-id>](

    wss://api.liara.ir?token=<api-token>&cmd=/bin/bash&project_id=<project-id>)


    Parameters:

    - `token`: Your api token in liara

    - `cmd`: By default /bin/bash

    - `project_id`: The id of your project in liara

    - `teamID`: To access services in a team


    This `WebSocket` endpoint allows `real-time`

    communication with the projects service hosted

    at `Liara` You can use `WebSocket protocols`

    to send and receive data, enabling efficient and

    low-latency interactions with the projects
  termsOfService: '#'
  contact:
    email: info@liara.ir
  version: 1.0.0
servers:
  - url: https://api.liara.ir
security:
  - jwt: []
  - bearerAuth: []
tags:
  - name: Apps
    description: Everything about your Apps
  - name: Deploy
    description: Deploy endpoints
  - name: Settings
    description: Settings of your app
  - name: Disks
    description: Disks of your app
  - name: Domains
    description: Domains of your app
  - name: Reports
    description: Reports of your app
externalDocs:
  description: Find out more about PaaS
  url: http://liara.ir
paths:
  /v1/projects:
    post:
      tags:
        - Apps
      summary: Create a app
      description: create app that user owns
      operationId: createApp
      requestBody:
        content:
          application/json:
            schema:
              $ref: '#/components/schemas/Create-app'
        required: true
      responses:
        '200':
          description: Successful operation
          content: {}
        '400':
          description: Bad request
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '409':
          description: Conflict
          content: {}
components:
  schemas:
    Create-app:
      type: object
      properties:
        name:
          type: string
          description: The name of app that you want to create
        planID:
          type: string
          description: The plan of app that you want to create
        platform:
          type: string
          description: The platform of app that you want to create
        readOnlyRootFilesystem:
          type: boolean
          description: For filesystem
        network:
          type: string
          description: For project
  securitySchemes:
    jwt:
      type: apiKey
      name: Authorization
      in: header
    bearerAuth:
      type: http
      scheme: bearer
      bearerFormat: JWT

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.