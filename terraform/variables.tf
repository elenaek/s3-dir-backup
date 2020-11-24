variable "targetRegion" {
    default = "us-east-1"
}
variable "resourceGroupName" {
    default = "mpart-dir-backup"
}
variable "resourceGroupDescription" {
    default = "mParticle Take Home Assignment"
}
variable "backupBucketName" {
    default = "mpart-dir-backup"
}

variable "bucketNameSsmParamPath" {
    default = "/mpart/bucket_name"
}

variable "stackTags" {
    default = {
        "purpose" = "mparticle"
        "app" = "takehome"
    }
    type = map(string)
}