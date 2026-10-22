> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# Get releases of app

> get releases of app that user owns



## OpenAPI

````yaml /spec/paas.yaml get /v1/projects/{name}/releases
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
  /v1/projects/{name}/releases:
    get:
      tags:
        - Apps
      summary: Get releases of app
      description: get releases of app that user owns
      operationId: getAppReleases
      parameters:
        - name: name
          in: path
          description: The name of your app
          required: true
          schema:
            type: string
        - name: page
          in: query
          description: The page of your releases
          required: true
          schema:
            type: number
            default: 1
        - name: count
          in: query
          description: The count of your releases
          required: true
          schema:
            type: number
            default: 10
      responses:
        '200':
          description: Successful operation
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Releases'
        '400':
          description: Bad request
          content: {}
        '401':
          description: Missing authentication
          content: {}
        '404':
          description: App does not exists.
          content: {}
components:
  schemas:
    Releases:
      type: object
      properties:
        total:
          type: number
          description: The total of releases
        currentRelease:
          type: string
          description: The currentRelease of releases
        readyReleasesCount:
          type: number
          description: The total of releases
        releases:
          type: array
          description: The total of releases
          items:
            type: object
            properties:
              _id:
                type: string
                description: The id of release
              type:
                type: string
                description: The type of release
              imageName:
                type: string
                description: The imageName of release
              projectType:
                type: string
                description: The projectType of release
              state:
                type: string
                description: The state of release
              port:
                type: number
                description: The port of release
              gitInfo:
                type: object
                properties:
                  branch:
                    type: string
                    nullable: true
                  message:
                    type: string
                    nullable: true
                  commit:
                    type: string
                    nullable: true
                  committedAt:
                    type: string
                    format: date-time
                    nullable: true
                  remote:
                    type: string
                    nullable: true
                  author:
                    type: object
                    properties:
                      email:
                        type: string
                        nullable: true
                      name:
                        type: string
                        nullable: true
                  tags:
                    type: array
                    items:
                      type: string
              client:
                type: string
                description: The client of release
              finishedAt:
                type: string
                description: The finishedAt of release
              createdAt:
                type: string
                description: The createdAt of release
              tag:
                type: string
                description: The tag of release
              sourceAvailable:
                type: boolean
                description: The sourceAvailable of release
        platform:
          type: string
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