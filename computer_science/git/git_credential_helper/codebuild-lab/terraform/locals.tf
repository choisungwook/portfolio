locals {
  # repo a는 CodeBuild source, repo b는 build 안에서 shell script가 clone하는 대상이다.
  repo_a_url = "https://github.com/${var.github_org}/${var.repo_a_name}.git"
  repo_b_url = "https://github.com/${var.github_org}/${var.repo_b_name}.git"

  # credential helper는 useHttpPath=true 때문에 path 단위로 조회된다.
  # source repo path로 토큰을 꺼내야 하므로 build에 이 값을 넘긴다.
  repo_a_path = "${var.github_org}/${var.repo_a_name}.git"
}
