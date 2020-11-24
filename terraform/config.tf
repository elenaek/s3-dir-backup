provider "aws" {
    profile = "default"
    region = var.targetRegion
}
resource "aws_resourcegroups_group" "mpthResourceGroup" {
    name = var.resourceGroupName
    description = var.resourceGroupDescription
    resource_query {
        query = jsonencode(
        {
            "ResourceTypeFilters" = ["AWS::AllSupported"],
            "TagFilters" = [
                {
                    "Key" = "purpose",
                    "Values" = [var.stackTags.purpose]
                },
                {
                    "Key" = "app",
                    "Values" = [var.stackTags.app]
                }
            ]
        })
        type = "TAG_FILTERS_1_0"
    }
}
resource "aws_s3_bucket" "dirBackupBucket" {
    bucket = var.backupBucketName
    tags = var.stackTags
    acl = "private"

    lifecycle_rule {
        id = "expireAfter7Days"
        enabled = true
        expiration {
            days = 7
        }
    }
}

resource "aws_ssm_parameter" "dirBackupBucketNameSsmParam" {
    name = var.bucketNameSsmParamPath
    type = "String"
    value = var.backupBucketName
    tags = var.stackTags
}
output "dirBackupSsmParamPath" {
    value = aws_ssm_parameter.dirBackupBucketNameSsmParam.name
}