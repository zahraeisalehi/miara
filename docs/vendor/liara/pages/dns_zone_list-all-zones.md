> ## Documentation Index
> Fetch the complete documentation index at: https://developers.liara.ir/llms.txt
> Use this file to discover all available pages before exploring further.

# List all zones

> list all zones that user owns



## OpenAPI

````yaml /spec/dns.yaml get /api/v1/zones
openapi: 3.0.1
info:
  title: DNS
  description: |-
    Manage dns zones and records

    Parameters:
    - `teamID`: To access services in a team
  termsOfService: '#'
  contact:
    email: info@liara.ir
  version: 1.0.0
servers:
  - url: https://dns-service.liara.ir
security:
  - jwt: []
tags:
  - name: Zone
    description: Everything about your Zones
  - name: Check Name Servers
    description: Check Name Servers endpoints
  - name: Dns Record
    description: Dns Record of your zones
externalDocs:
  description: Find out more about DNS
  url: http://liara.ir
paths:
  /api/v1/zones:
    get:
      tags:
        - Zone
      summary: List all zones
      description: list all zones that user owns
      operationId: getListZones
      responses:
        '200':
          description: An server
          content:
            application/json:
              schema:
                $ref: '#/components/schemas/Zones'
components:
  schemas:
    Zones:
      type: object
      properties:
        status:
          type: string
        data:
          type: array
          items:
            $ref: '#/components/schemas/Zone'
    Zone:
      type: object
      properties:
        id:
          type: string
        name:
          type: string
          description: >-
            The name of the zone, “liara.ir”, max length: 253, pattern:
            ^([a-zA-Z0-9][\-a-zA-Z0-9]*\.)+[\-a-zA-Z0-9]{2,20}$
        status:
          type: string
          description: >-
            The status of the zone, valid values: [CREATING, PENDING, ACTIVE,
            DELETING]
        currentNameServers:
          type: array
          items:
            type: string
        nameServers:
          type: array
          items:
            type: string
        lastCheckAt:
          type: string
          description: Last time when zones nameservers was checked
        createdAt:
          type: string
          description: Time when zone was created
  securitySchemes:
    jwt:
      type: apiKey
      name: Authorization
      in: header

````

This documentation is built and hosted on [Mintlify](https://mintlify.com), a developer documentation platform.