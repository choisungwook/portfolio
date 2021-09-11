> 아직 제가 서블릿과 스프링 컨테이너의 이해가 얕습니다. 그러므로 아래 정보가 정확하지 않을 수 있습니다.

# filterchain이란?
> 참고자료:
* 스프링시큐리티는 서블릿 필터로 구현된 보안기능을 담당하는 필터입니다.
* 필터안에 여러가지 필터를 가질 수 있습니다. 마치 이 형태가 체인형태여서 filterchain이라고 이름이 붙여진 것 같습니다.
* 서블릿 필터로 바로 filterchain을 구현하면 스프링 라이플사이클 범위 밖입니다. 그러므로 spring bean에 접근하지 못하고 인증, 인가과정에서 애로사항(사용자 데이터베이스 접근불가 등)이 발생합니다. 그래서 프록시패턴을 사용하여 DelegatingFilterProxy가 filterchain을 구현합니다. (참고자료 [2])
* filterchain은 default로 여러 필터를 생성하고 차례대로 전부 실행합니다. 또한, 사용자가 필터를 수정하거나 새로운 필터를 filterchain에 등록시킬 수 있습니다.

<br>

# 참고자료
* [1] filterchain: https://docs.spring.io/spring-security/site/docs/current/reference/html5/#servlet-filters-review
* [2] delegatingfilterproxy: https://docs.spring.io/spring-security/site/docs/current/reference/html5/#servlet-delegatingfilterproxy