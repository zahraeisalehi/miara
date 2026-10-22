> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Turn on or off a app

> turn on or off a app that user owns



## OpenAPI

````yaml /spec/paas.yaml post /v1/projects/{name}/actions/scale
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
  /v1/projects/{name}/actions/scale:
    post:
      tags:
        - Apps
      summary: Turn on or off a app
      description: turn on or off a app that user owns
      operationId: turnApp
      parameters:
        - name: name
          in: path
          description: The name of the app to turn on or off
          required: true
          schema:
            type: string
      requestBody:
        description: Return 1 to turn on or 0 to turn off
        content:
          application/json:
            schema:
              required:
                - scale
              type: object
              properties:
                scale:
                  type: number
        required: true
      responses:
        '200':
          description: Your request has been submitted.
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '404':
          description: App does not exists.
          content: {}
components:
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