const nginxYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: nginx
  namespace: default
spec:
  replicas: 3
  selector:
    matchLabels:
      app: nginx
  template:
    metadata:
      labels:
        app: nginx
    spec:
      containers:
        - name: nginx
          image: nginx:1.25
          resources:
            requests:
              cpu: "500m"
              memory: "512Mi"
---
apiVersion: v1
kind: Service
metadata:
  name: nginx-lb
spec:
  type: LoadBalancer
  selector:
    app: nginx
  ports:
    - port: 80`;

const redisYaml = `apiVersion: apps/v1
kind: StatefulSet
metadata:
  name: redis
  namespace: cache
spec:
  serviceName: redis
  replicas: 3
  selector:
    matchLabels:
      app: redis
  template:
    metadata:
      labels:
        app: redis
    spec:
      containers:
        - name: redis
          image: redis:7.2
          resources:
            requests:
              cpu: "250m"
              memory: "256Mi"
            limits:
              cpu: "500m"
              memory: "512Mi"
  volumeClaimTemplates:
    - metadata:
        name: data
      spec:
        accessModes: ["ReadWriteOnce"]
        resources:
          requests:
            storage: 10Gi`;

const fatYaml = `apiVersion: apps/v1
kind: Deployment
metadata:
  name: api
  namespace: production
spec:
  replicas: 2
  selector:
    matchLabels:
      app: api
  template:
    metadata:
      labels:
        app: api
    spec:
      containers:
        - name: api
          image: myorg/api:latest
          resources:
            requests:
              cpu: "2"
              memory: "4Gi"
        - name: sidecar
          image: fluent/fluent-bit
---
apiVersion: v1
kind: Service
metadata:
  name: api-lb
  namespace: production
spec:
  type: LoadBalancer
  selector:
    app: api
  ports:
    - port: 443`;

export const EXAMPLES = [
  { id: 'nginx', label: 'nginx + LoadBalancer', yaml: nginxYaml },
  { id: 'redis', label: 'Redis StatefulSet + PVCs', yaml: redisYaml },
  { id: 'fat', label: 'Fat deployment (warnings)', yaml: fatYaml },
] as const;

export type ExampleId = (typeof EXAMPLES)[number]['id'];

export const DEFAULT_EXAMPLE = EXAMPLES[0];
