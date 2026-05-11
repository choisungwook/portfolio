project_name = "tgw-handson"

vpc_configs = {
  a = {
    cidr            = "10.10.0.0/16"
    private_subnets = ["10.10.1.0/24"]
    public_subnets  = ["10.10.101.0/24"]
  }
  b = {
    cidr            = "10.20.0.0/16"
    private_subnets = ["10.20.1.0/24"]
    public_subnets  = ["10.20.101.0/24"]
  }
  c = {
    cidr            = "10.30.0.0/16"
    private_subnets = ["10.30.1.0/24"]
    public_subnets  = ["10.30.101.0/24"]
  }
}
