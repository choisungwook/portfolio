
# dsf

```sh
vault write auth/approle/role/python token_policies="mysql-read-policy" \
  token_ttl=1h token_max_ttl=4h

```


```sh
vault list auth/approle/role
```


```sh
vault read auth/approle/role/python
```
