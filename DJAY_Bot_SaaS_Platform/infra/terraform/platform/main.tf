data "aws_availability_zones" "available" {
  state = "available"
}

data "aws_caller_identity" "current" {}

locals {
  name = "djay-${var.environment}"
  azs  = slice(data.aws_availability_zones.available.names, 0, 2)

  services = {
    public-site     = { port = 8080, health = "/api/health/ready", public = true, hostname = var.hostnames.public }
    tenant-web      = { port = 8080, health = "/api/health/ready", public = true, hostname = var.hostnames.tenant }
    platform-master = { port = 8080, health = "/api/health/ready", public = true, hostname = var.hostnames.platform }
    api             = { port = 8080, health = "/api/health/ready", public = true, hostname = var.hostnames.api }
    ai-gateway      = { port = 8080, health = "/health/ready", public = false, hostname = null }
    voice-gateway   = { port = 8080, health = "/health/ready", public = true, hostname = var.hostnames.voice }
    workers         = { port = 0, health = null, public = false, hostname = null }
  }

  public_services = { for key, value in local.services : key => value if value.public }
  secret_pairs = flatten([
    for service, names in var.secret_names_by_service : [
      for name in names : { key = "${service}/${name}", service = service, name = name }
    ]
  ])
  secret_map = { for item in local.secret_pairs : item.key => item }
}

resource "aws_kms_key" "platform" {
  description             = "DJAY ${var.environment} application and data encryption"
  deletion_window_in_days = 30
  enable_key_rotation     = true
}

resource "aws_kms_alias" "platform" {
  name          = "alias/${local.name}"
  target_key_id = aws_kms_key.platform.key_id
}

resource "aws_vpc" "this" {
  cidr_block           = var.vpc_cidr
  enable_dns_hostnames = true
  enable_dns_support   = true
  tags                 = { Name = "${local.name}-vpc" }
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = { Name = "${local.name}-igw" }
}

resource "aws_subnet" "public" {
  for_each                = { for index, az in local.azs : tostring(index) => az }
  vpc_id                  = aws_vpc.this.id
  availability_zone       = each.value
  cidr_block              = cidrsubnet(var.vpc_cidr, 4, tonumber(each.key))
  map_public_ip_on_launch = true
  tags                    = { Name = "${local.name}-public-${each.value}", Tier = "public" }
}

resource "aws_subnet" "private" {
  for_each          = { for index, az in local.azs : tostring(index) => az }
  vpc_id            = aws_vpc.this.id
  availability_zone = each.value
  cidr_block        = cidrsubnet(var.vpc_cidr, 4, tonumber(each.key) + 8)
  tags              = { Name = "${local.name}-private-${each.value}", Tier = "private" }
}

resource "aws_eip" "nat" {
  domain = "vpc"
  tags   = { Name = "${local.name}-nat" }
}

resource "aws_nat_gateway" "this" {
  allocation_id = aws_eip.nat.id
  subnet_id     = aws_subnet.public["0"].id
  depends_on    = [aws_internet_gateway.this]
  tags          = { Name = "${local.name}-nat" }
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block = "0.0.0.0/0"
    gateway_id = aws_internet_gateway.this.id
  }
  tags = { Name = "${local.name}-public" }
}

resource "aws_route_table_association" "public" {
  for_each       = aws_subnet.public
  subnet_id      = each.value.id
  route_table_id = aws_route_table.public.id
}

resource "aws_route_table" "private" {
  vpc_id = aws_vpc.this.id
  route {
    cidr_block     = "0.0.0.0/0"
    nat_gateway_id = aws_nat_gateway.this.id
  }
  tags = { Name = "${local.name}-private" }
}

resource "aws_route_table_association" "private" {
  for_each       = aws_subnet.private
  subnet_id      = each.value.id
  route_table_id = aws_route_table.private.id
}

resource "aws_security_group" "alb" {
  name        = "${local.name}-alb"
  description = "Public HTTPS ingress"
  vpc_id      = aws_vpc.this.id
  ingress {
    protocol    = "tcp"
    from_port   = 443
    to_port     = 443
    cidr_blocks = ["0.0.0.0/0"]
  }
  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "ecs" {
  name        = "${local.name}-ecs"
  description = "ECS service traffic"
  vpc_id      = aws_vpc.this.id
  ingress {
    protocol        = "tcp"
    from_port       = 8080
    to_port         = 8080
    security_groups = [aws_security_group.alb.id]
  }
  ingress {
    protocol  = "tcp"
    from_port = 8080
    to_port   = 8080
    self      = true
  }
  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_security_group" "database" {
  name        = "${local.name}-database"
  description = "PostgreSQL from ECS only"
  vpc_id      = aws_vpc.this.id
  ingress {
    protocol        = "tcp"
    from_port       = 5432
    to_port         = 5432
    security_groups = [aws_security_group.ecs.id]
  }
  egress {
    protocol    = "-1"
    from_port   = 0
    to_port     = 0
    cidr_blocks = ["0.0.0.0/0"]
  }
}

resource "aws_db_subnet_group" "this" {
  name       = local.name
  subnet_ids = values(aws_subnet.private)[*].id
}

resource "aws_db_instance" "postgres" {
  identifier                      = "${local.name}-postgres"
  engine                          = "postgres"
  engine_version                  = "16"
  instance_class                  = var.database_instance_class
  allocated_storage               = var.database_allocated_storage
  max_allocated_storage           = var.database_max_allocated_storage
  storage_type                    = "gp3"
  storage_encrypted               = true
  kms_key_id                      = aws_kms_key.platform.arn
  db_name                         = "djay_saas"
  username                        = "djay_admin"
  manage_master_user_password     = true
  master_user_secret_kms_key_id   = aws_kms_key.platform.arn
  multi_az                        = var.environment == "production"
  publicly_accessible             = false
  db_subnet_group_name            = aws_db_subnet_group.this.name
  vpc_security_group_ids          = [aws_security_group.database.id]
  backup_retention_period         = var.environment == "production" ? 35 : 7
  copy_tags_to_snapshot           = true
  deletion_protection             = var.environment == "production"
  skip_final_snapshot             = var.environment != "production"
  final_snapshot_identifier       = var.environment == "production" ? "${local.name}-final" : null
  enabled_cloudwatch_logs_exports = ["postgresql", "upgrade"]
  performance_insights_enabled    = true
  performance_insights_kms_key_id = aws_kms_key.platform.arn
  auto_minor_version_upgrade      = true
  apply_immediately               = false
}

resource "aws_ecr_repository" "service" {
  for_each             = local.services
  name                 = "djay/${var.environment}/${each.key}"
  image_tag_mutability = "IMMUTABLE"
  encryption_configuration {
    encryption_type = "KMS"
    kms_key         = aws_kms_key.platform.arn
  }
  image_scanning_configuration { scan_on_push = true }
}

resource "aws_ecr_lifecycle_policy" "service" {
  for_each   = aws_ecr_repository.service
  repository = each.value.name
  policy = jsonencode({ rules = [{
    rulePriority = 1
    description  = "Retain the newest 30 release images"
    selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = 30 }
    action       = { type = "expire" }
  }] })
}

resource "aws_secretsmanager_secret" "runtime" {
  for_each                = local.secret_map
  name                    = "${local.name}/${each.value.service}/${each.value.name}"
  kms_key_id              = aws_kms_key.platform.arn
  recovery_window_in_days = var.environment == "production" ? 30 : 7
}

resource "aws_ecs_cluster" "this" {
  name = local.name
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

resource "aws_cloudwatch_log_group" "service" {
  for_each          = local.services
  name              = "/djay/${var.environment}/${each.key}"
  retention_in_days = var.environment == "production" ? 90 : 30
  kms_key_id        = aws_kms_key.platform.arn
}

resource "aws_iam_role" "execution" {
  name = "${local.name}-ecs-execution"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_iam_role_policy_attachment" "execution" {
  role       = aws_iam_role.execution.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy" "execution_secrets" {
  role = aws_iam_role.execution.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Effect = "Allow", Action = ["secretsmanager:GetSecretValue"], Resource = values(aws_secretsmanager_secret.runtime)[*].arn },
      { Effect = "Allow", Action = ["kms:Decrypt"], Resource = [aws_kms_key.platform.arn] }
    ]
  })
}

resource "aws_iam_role" "task" {
  for_each = local.services
  name     = "${local.name}-${each.key}-task"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "ecs-tasks.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
}

resource "aws_lb" "this" {
  name                       = local.name
  internal                   = false
  load_balancer_type         = "application"
  security_groups            = [aws_security_group.alb.id]
  subnets                    = values(aws_subnet.public)[*].id
  enable_deletion_protection = var.environment == "production"
  drop_invalid_header_fields = true
}

resource "aws_lb_target_group" "service" {
  for_each    = local.public_services
  name        = substr("${local.name}-${each.key}", 0, 32)
  port        = each.value.port
  protocol    = "HTTP"
  target_type = "ip"
  vpc_id      = aws_vpc.this.id
  health_check {
    enabled             = true
    path                = each.value.health
    matcher             = "200"
    interval            = 30
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }
  deregistration_delay = each.key == "voice-gateway" ? 120 : 30
}

resource "aws_lb_listener" "https" {
  load_balancer_arn = aws_lb.this.arn
  port              = 443
  protocol          = "HTTPS"
  ssl_policy        = "ELBSecurityPolicy-TLS13-1-2-2021-06"
  certificate_arn   = var.certificate_arn
  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "application/json"
      message_body = "{\"status\":\"not_found\"}"
      status_code  = "404"
    }
  }
}

resource "aws_lb_listener_rule" "service" {
  for_each     = local.public_services
  listener_arn = aws_lb_listener.https.arn
  priority     = 100 + index(sort(keys(local.public_services)), each.key)
  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.service[each.key].arn
  }
  condition {
    host_header {
      values = [each.value.hostname]
    }
  }
}

resource "aws_service_discovery_private_dns_namespace" "this" {
  name = "${var.environment}.djay.internal"
  vpc  = aws_vpc.this.id
}

resource "aws_service_discovery_service" "service" {
  for_each = { for key, value in local.services : key => value if key == "ai-gateway" || key == "api" }
  name     = each.key
  dns_config {
    namespace_id = aws_service_discovery_private_dns_namespace.this.id
    dns_records {
      ttl  = 10
      type = "A"
    }
    routing_policy = "MULTIVALUE"
  }
  health_check_custom_config {}
}

resource "aws_ecs_task_definition" "service" {
  for_each                 = local.services
  family                   = "${local.name}-${each.key}"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(lookup(var.cpu_by_service, each.key, each.key == "voice-gateway" ? 1024 : 512))
  memory                   = tostring(lookup(var.memory_by_service, each.key, each.key == "voice-gateway" ? 2048 : 1024))
  execution_role_arn       = aws_iam_role.execution.arn
  task_role_arn            = aws_iam_role.task[each.key].arn
  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = "ARM64"
  }
  container_definitions = jsonencode([{
    name         = each.key
    image        = "${lookup(var.image_repositories, each.key, aws_ecr_repository.service[each.key].repository_url)}:${var.release_version}"
    essential    = true
    portMappings = each.value.port > 0 ? [{ containerPort = each.value.port, hostPort = each.value.port, protocol = "tcp" }] : []
    environment = concat(
      [{ name = "NODE_ENV", value = "production" }, { name = "OPERATIONS_ENVIRONMENT", value = var.environment }, { name = "OPERATIONS_RELEASE_VERSION", value = var.release_version }],
      [for name, value in lookup(var.service_environment, each.key, {}) : { name = name, value = value }]
    )
    secrets = [for name in lookup(var.secret_names_by_service, each.key, []) : {
      name = name, valueFrom = aws_secretsmanager_secret.runtime["${each.key}/${name}"].arn
    }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = aws_cloudwatch_log_group.service[each.key].name
        awslogs-region        = var.aws_region
        awslogs-stream-prefix = "ecs"
      }
    }
    readonlyRootFilesystem = true
    linuxParameters        = { initProcessEnabled = true }
  }])
}

resource "aws_ecs_service" "service" {
  for_each                           = local.services
  name                               = each.key
  cluster                            = aws_ecs_cluster.this.id
  task_definition                    = aws_ecs_task_definition.service[each.key].arn
  desired_count                      = lookup(var.desired_counts, each.key, 1)
  launch_type                        = "FARGATE"
  platform_version                   = "LATEST"
  health_check_grace_period_seconds  = each.value.public ? 60 : null
  enable_execute_command             = false
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  network_configuration {
    subnets          = values(aws_subnet.private)[*].id
    security_groups  = [aws_security_group.ecs.id]
    assign_public_ip = false
  }
  dynamic "load_balancer" {
    for_each = each.value.public ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.service[each.key].arn
      container_name   = each.key
      container_port   = each.value.port
    }
  }
  dynamic "service_registries" {
    for_each = contains(keys(aws_service_discovery_service.service), each.key) ? [1] : []
    content { registry_arn = aws_service_discovery_service.service[each.key].arn }
  }
  lifecycle { ignore_changes = [desired_count] }
  depends_on = [aws_lb_listener.https, aws_iam_role_policy.execution_secrets]
}

resource "aws_s3_bucket" "widget" {
  bucket = "${local.name}-widget-${data.aws_caller_identity.current.account_id}"
}

resource "aws_s3_bucket_public_access_block" "widget" {
  bucket                  = aws_s3_bucket.widget.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_versioning" "widget" {
  bucket = aws_s3_bucket.widget.id
  versioning_configuration { status = "Enabled" }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "widget" {
  bucket = aws_s3_bucket.widget.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
  }
}

resource "aws_cloudfront_origin_access_control" "widget" {
  name                              = "${local.name}-widget"
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_distribution" "widget" {
  enabled         = true
  is_ipv6_enabled = true
  aliases         = [var.hostnames.widget]
  origin {
    domain_name              = aws_s3_bucket.widget.bucket_regional_domain_name
    origin_id                = "widget-s3"
    origin_access_control_id = aws_cloudfront_origin_access_control.widget.id
  }
  default_cache_behavior {
    allowed_methods            = ["GET", "HEAD", "OPTIONS"]
    cached_methods             = ["GET", "HEAD", "OPTIONS"]
    target_origin_id           = "widget-s3"
    viewer_protocol_policy     = "redirect-to-https"
    compress                   = true
    cache_policy_id            = "658327ea-f89d-4fab-a63d-7e88639e58f6"
    response_headers_policy_id = "60669652-455b-4ae9-85a4-c4c02393f86c"
  }
  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }
  viewer_certificate {
    acm_certificate_arn      = var.cloudfront_certificate_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
  web_acl_id = null
}

data "aws_iam_policy_document" "widget" {
  statement {
    actions   = ["s3:GetObject"]
    resources = ["${aws_s3_bucket.widget.arn}/*"]
    principals {
      type        = "Service"
      identifiers = ["cloudfront.amazonaws.com"]
    }
    condition {
      test     = "StringEquals"
      variable = "AWS:SourceArn"
      values   = [aws_cloudfront_distribution.widget.arn]
    }
  }
}

resource "aws_s3_bucket_policy" "widget" {
  bucket = aws_s3_bucket.widget.id
  policy = data.aws_iam_policy_document.widget.json
}

resource "aws_route53_record" "service" {
  for_each = local.public_services
  zone_id  = var.route53_zone_id
  name     = each.value.hostname
  type     = "A"
  alias {
    name                   = aws_lb.this.dns_name
    zone_id                = aws_lb.this.zone_id
    evaluate_target_health = true
  }
}

resource "aws_route53_record" "widget" {
  zone_id = var.route53_zone_id
  name    = var.hostnames.widget
  type    = "A"
  alias {
    name                   = aws_cloudfront_distribution.widget.domain_name
    zone_id                = aws_cloudfront_distribution.widget.hosted_zone_id
    evaluate_target_health = false
  }
}

resource "aws_sns_topic" "operations" {
  name              = "${local.name}-operations"
  kms_master_key_id = aws_kms_key.platform.id
}

resource "aws_sns_topic_subscription" "email" {
  count     = var.alarm_email == null ? 0 : 1
  topic_arn = aws_sns_topic.operations.arn
  protocol  = "email"
  endpoint  = var.alarm_email
}

resource "aws_cloudwatch_metric_alarm" "alb_5xx" {
  alarm_name          = "${local.name}-alb-5xx"
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 2
  threshold           = 5
  comparison_operator = "GreaterThanOrEqualToThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { LoadBalancer = aws_lb.this.arn_suffix }
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}

resource "aws_cloudwatch_metric_alarm" "database_cpu" {
  alarm_name          = "${local.name}-database-cpu"
  namespace           = "AWS/RDS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "breaching"
  dimensions          = { DBInstanceIdentifier = aws_db_instance.postgres.id }
  alarm_actions       = [aws_sns_topic.operations.arn]
  ok_actions          = [aws_sns_topic.operations.arn]
}
