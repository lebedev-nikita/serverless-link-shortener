terraform {
  required_version = ">= 0.12"
  required_providers {
    yandex = {
      source  = "yandex-cloud/yandex"
      version = "0.130.0"
    }
  }
}

provider "yandex" {
  token     = var.yandex_token
  cloud_id  = var.yandex_cloud_id
  folder_id = var.yandex_folder_id
  zone      = var.yandex_zone
}

# main.tf

resource "yandex_iam_service_account" "sa" {
  folder_id = var.yandex_folder_id
  name      = "sa-tf-link-shortener"
}

resource "yandex_resourcemanager_folder_iam_member" "sa_editor" {
  folder_id = var.yandex_folder_id
  role      = "editor"
  member    = "serviceAccount:${yandex_iam_service_account.sa.id}"
}

resource "yandex_iam_service_account_static_access_key" "sa_static_key" {
  service_account_id = yandex_iam_service_account.sa.id
  description        = "static access key for object storage"
}

resource "yandex_storage_bucket" "main" {
  bucket     = var.bucket_name
  access_key = yandex_iam_service_account_static_access_key.sa_static_key.access_key
  secret_key = yandex_iam_service_account_static_access_key.sa_static_key.secret_key
  max_size   = 1024 * 1024 * 1024

  anonymous_access_flags {
    read = true
  }
}

resource "yandex_storage_object" "index-html" {
  bucket       = yandex_storage_bucket.main.bucket
  key          = "index.html"
  source       = "../src/index.html"
  content_type = "text/html"
}

resource "yandex_api_gateway" "api_gateway" {
  name = "api-gateway"
  spec = local.api_gateway_config
}

resource "yandex_function" "fn-handler" {
  user_hash          = sha256("../builds/function.zip")
  name               = "fn-handler"
  runtime            = "nodejs18"
  entrypoint         = "index.handler"
  memory             = 128
  execution_timeout  = 5
  service_account_id = yandex_iam_service_account.sa.id

  environment = {
    endpoint = yandex_ydb_database_serverless.ydb.ydb_api_endpoint
    database = yandex_ydb_database_serverless.ydb.database_path
  }

  content {
    zip_filename = "../builds/function.zip"
  }
}

resource "yandex_function_iam_binding" "roles" {
  function_id = yandex_function.fn-handler.id
  role        = "serverless.functions.invoker"
  members     = ["system:allUsers"]
}

resource "yandex_ydb_database_serverless" "ydb" {
  name      = "ydb"
  folder_id = var.yandex_folder_id
}

resource "yandex_ydb_table" "links" {
  path              = "links"
  connection_string = yandex_ydb_database_serverless.ydb.ydb_full_endpoint

  column {
    name     = "id"
    type     = "Utf8"
    not_null = true
  }

  column {
    name     = "link"
    type     = "Utf8"
    not_null = true
  }

  primary_key = ["id"]
}

locals {
  api_gateway_config = <<-EOT
    openapi: 3.0.0
    info:
      title: for-serverless-shortener
      version: 1.0.0
    servers:
    - url: # не трогаем, оставляем, как было
    paths:
      /:
        get:
          x-yc-apigateway-integration:
            type: object_storage
            bucket:             ${var.bucket_name}                      # <-- название бакета
            object:             ${yandex_storage_object.index-html.key} # <-- название html-файла
            presigned_redirect: false
            service_account:    ${yandex_iam_service_account.sa.id}     # <-- ID сервисного аккаунта
          operationId: static
      /shorten:
        post:
          x-yc-apigateway-integration:
            type: cloud_functions
            function_id:  ${yandex_function.fn-handler.id}              # <-- ID функции
            service_account:    ${yandex_iam_service_account.sa.id}     # <-- ID сервисного аккаунта
          operationId: shorten
      /r/{id}:
        get:
          x-yc-apigateway-integration:
            type: cloud_functions
            function_id:  ${yandex_function.fn-handler.id}              # <-- ID функции
          operationId: redirect
          parameters:
          - description: id of the url
            explode: false
            in: path
            name: id
            required: true
            schema:
              type: string
            style: simple
  EOT
}

# variables.tf

variable "yandex_token" {
  description = "Yandex Cloud OAuth token"
  type        = string
}

variable "yandex_cloud_id" {
  description = "Yandex Cloud ID"
  type        = string
}

variable "yandex_folder_id" {
  description = "Yandex Folder ID"
  type        = string
}

variable "yandex_zone" {
  description = "Yandex Cloud zone"
  type        = string
  default     = "ru-central1-a"
}

variable "bucket_name" {
  type = string
}
