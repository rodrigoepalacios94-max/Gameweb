1 – INTRODUCCIÓN
1.1 Objetivo del sistema
GAME es una plataforma web destinada a la administración integral de torneos de tenis.
Su objetivo principal es automatizar la mayor cantidad posible de tareas que actualmente realiza el profesor de forma manual, permitiendo administrar torneos desde la inscripción de los jugadores hasta la actualización automática del ranking.
El sistema busca reducir tiempos de organización, minimizar errores humanos y ofrecer una mejor experiencia tanto para jugadores como para administradores.

1.2 Objetivos
GAME deberá permitir:
•	Automatizar el armado de torneos. 
•	Reducir el trabajo administrativo. 
•	Mantener actualizado el ranking. 
•	Organizar automáticamente las llaves. 
•	Administrar múltiples categorías simultáneamente. 
•	Programar partidos considerando disponibilidad de jugadores. 
•	Gestionar varios fines de semana de competencia. 
•	Publicar resultados en tiempo real. 
•	Centralizar toda la información del circuito. 
























2 – Arquitectura generasl
2.1 Tipos de usuario
El sistema contará inicialmente con dos perfiles.
Jugador
Participa de los torneos.
Profesor / Administrador
Administra completamente el circuito.

2.2 Arquitectura funcional
El sistema estará dividido en módulos independientes.
•	Usuarios 
•	Jugadores 
•	Categorías 
•	Ranking 
•	Torneos 
•	Inscripciones 
•	Pagos 
•	Programación 
•	Llaves 
•	Partidos 
•	Resultados 
•	Estadísticas 
•	Sistema disciplinario 
•	Configuración 
•	Notificaciones 
________________________________________
2.3 Principios de diseño
Toda acción automática podrá editarse manualmente.
Nunca existirán procesos irreversibles sin confirmación.
Toda modificación importante quedará registrada en un historial.














3 – Jugadores
3.1 Registro
Cada jugador deberá registrarse mediante:
•	Nombre 
•	Apellido 
•	DNI 
•	Fecha de nacimiento 
•	Sexo 
•	Teléfono 
•	Correo electrónico 
•	Contraseña 
•	Categoría

3.2 Perfil
Cada jugador tendrá un perfil único.
El perfil contendrá:
Información personal.
Podra subir su foto de perfil (la cual se vera en los torneos, en las llaves como miniatura)
Categoría actual.
Ranking General.
Historial de torneos.
Historial de partidos.
Estadísticas.
Estado disciplinario.

3.3 Categoría
Cada jugador posee una única categoría vigente.
Ejemplo:
•	Segunda 
•	Tercera 
•	Cuarta 
•	Quinta 
•	Sexta 
Las categorías son administradas únicamente por el profesor.
________________________________________
3.4 Inscripción en categorías
El jugador podrá inscribirse en:
Su categoría.
Categorías superiores.
Nunca podrá inscribirse directamente en una categoría inferior.
________________________________________
3.5 Solicitud de descenso
Si un jugador intenta anotarse en una categoría inferior aparecerá el siguiente mensaje:
No podés inscribirte en una categoría inferior a tu categoría actual.
¿Deseás solicitar un descenso de categoría?
Opciones:
•	Solicitar descenso. 
•	Cancelar. 
La solicitud quedará pendiente hasta que el profesor la apruebe o rechace.


3.6 Doble categoría
Un jugador podrá disputar más de una categoría dentro del mismo torneo.
Ejemplo:
•	Tercera. 
•	Segunda. 
El sistema deberá detectar cuando ambas categorías se disputen el mismo día y advertir al jugador antes de confirmar la inscripción.

3.7 Disponibilidad
La disponibilidad no se solicita durante la inscripción al torneo.
Cada partido futuro o pendiente genera su propia solicitud de confirmación de asistencia.
El jugador confirma que disputará ese partido e informa solamente los horarios en los que NO puede jugar.
Todos los horarios no marcados se consideran potencialmente disponibles.
La disponibilidad pertenece exclusivamente a ese partido específico.
Cada nuevo partido requiere una nueva confirmación.

3.8 Estado del jugador
Un jugador podrá encontrarse en alguno de los siguientes estados:
•	Activo. 
•	Suspendido. 
•	Bloqueado por faltas.























4 – Administrador
El profesor tendrá acceso completo al sistema.
Podrá administrar todos los módulos.
4.1 Dashboard
El panel principal mostrará:
Próximos torneos.
Partidos pendientes.
Inscripciones.
Solicitudes de descenso.
Jugadores bloqueados.
Notificaciones.
Estado del ranking

4.2 Gestión de jugadores
El profesor podrá:
Cambiar categoría.
Modificar ranking.
Bloquear jugadores.
Desbloquear jugadores.
Consultar historial.

4.3 Gestión de torneos
Crear.
Editar.
Cancelar.
Finalizar.

4.4 Gestión de resultados
El profesor podrá:
Registrar resultados.
Editar resultados.
Registrar W.O.
Registrar faltas.
Reprogramar partidos.

4.5 Gestión disciplinaria
Podrá:
Confirmar reclamos.
Aplicar faltas.
Bloquear jugadores.
Desbloquear jugadores.
Consultar historial disciplinario.

4.6 Configuración
Acceso a:
Categorías.
Puntajes.
Tipos de torneo.
Horarios.
Canchas.
Reglamentos.
Notificaciones.


5 – Configuración
Toda la configuración general del circuito será administrada desde un único módulo.
Los cambios impactarán en todos los torneos futuros.
5.1 Categorías
Las categorías serán completamente configurables por el profesor.
Cada categoría tendrá como mínimo los siguientes campos:
•	Nombre. 
•	Rama (Masculino / Femenino). 
•	Nivel jerárquico. 
•	Estado (Activa/Inactiva). 

El sistema utilizará el Nivel Jerárquico para determinar automáticamente si un jugador puede inscribirse en otra categoría.
No se basará en el nombre.
Por ejemplo, si un club utiliza:
•	Primera A 
•	Primera B 
•	Intermedia 
•	Promocional 

el sistema seguirá funcionando correctamente porque la comparación se realizará mediante el nivel configurado.

5.1.2 Restricciones de inscripción
El sistema aplicará las siguientes reglas automáticamente:
✅ Puede jugar su misma categoría.
✅ Puede jugar categorías superiores.
❌ No puede jugar categorías inferiores.
En caso de intentar hacerlo:
No podés inscribirte en una categoría inferior.
¿Deseás solicitar un descenso de categoría?
La solicitud quedará pendiente hasta la decisión del profesor.

5.1.3 Cambio de categoría
El profesor podrá modificar la categoría de un jugador en cualquier momento.
El cambio quedará registrado indicando:
•	Categoría anterior. 
•	Nueva categoría. 
•	Fecha. 
•	Motivo (opcional).

5.2 Tipos de torneo
El sistema contemplará inicialmente tres formatos.
•	Preliminar. 
•	Zonas. 
•	Eliminación Directa. 
•	
Cada formato utilizará un algoritmo distinto para generar las llaves.

5.3 Sistema de puntajes
El profesor podrá configurar distintos tipos de puntuación.
Ejemplo:
GAME 1000.
MASTER GAME 1500.
Cada tipo permitirá definir:
•	Puntos por inscripción. 
•	Puntos por disputar la preliminar. 
•	Bonus por ganar la preliminar. 
•	Puntos por cada ronda alcanzada. 
•	Puntos para subcampeón. 
•	Puntos para campeón. 

5.4 Horarios
El profesor configurará los turnos disponibles.

5.5 Canchas
Se configurará la cantidad de canchas disponibles.
El algoritmo utilizará esta información para distribuir automáticamente los partidos.

5.6 Reglamentos
El profesor podrá publicar el reglamento oficial del circuito.
El jugador podrá consultarlo desde su perfil.

5.7 Parámetros disciplinarios
Configuración de:
•	Cantidad máxima de faltas permitidas. 
•	Acciones automáticas al alcanzar el límite. 
•	Reglas para W.O. 
•	Reglas para doble W.O. 
________________________________________
5.8 Notificaciones
Configuración de:
•	Correos electrónicos. 
•	Avisos internos del sistema.















6. Torneos
6.1 Concepto de Torneo
Un torneo representa una competencia organizada por GAME, donde participan una o varias categorías bajo un formato determinado.
Cada torneo será completamente independiente de los demás, conservando su propio historial, cuadros, resultados y estadísticas.

6.2 Información general
Cada torneo tendrá como mínimo los siguientes datos:
•	Nombre. 
•	Descripción (opcional). 
•	Fecha de inicio. 
•	Fecha del Día de Finales. 
•	Fecha prevista para semifinales. 
•	Estado. 
•	Tipo de torneo. 
•	Sistema de puntaje. 
•	Valor de inscripción. 
•	Categorías participantes. 
•	Reglamento específico (opcional). 
•	Cantidad máxima de jugadores por categoría (opcional). 
•	Observaciones internas. 
________________________________________
6.3 Estados del torneo
Un torneo podrá encontrarse en uno de los siguientes estados:
•	Borrador. 
•	Inscripciones abiertas. 
•	Inscripciones cerradas. 
•	En programación. 
•	En juego. 
•	Finalizado. 
•	Cancelado. 
Cada estado habilitará o bloqueará determinadas acciones.
Ejemplo:
Mientras las inscripciones estén abiertas se podrán agregar jugadores.
Una vez cerradas ya no será posible inscribirse salvo autorización manual del profesor.

6.4 Creación
El profesor deberá completar un asistente de creación.
Paso 1
Información general.
Paso 2
Seleccionar categorías.
Paso 3
Configurar formato del partido:
- Cantidad de sets.
- Games por set.
- Uso de Super Tie-Break.
Paso 4
Seleccionar sistema de puntaje.

Paso 5
Definir canchas y horarios.
Paso 6
Publicar torneo.

El formato competitivo de cada categoria no se selecciona durante la creacion inicial.
Preliminar, Zonas y Eliminacion Directa se definen por categoria despues del cierre de inscripciones, cuando GAME conoce la cantidad real de jugadores inscriptos en cada categoria.

6.5 Edición
Mientras el torneo no haya comenzado podrán modificarse todos los datos.
Una vez iniciado solamente podrán editarse:
•	Horarios. 
•	Canchas. 
•	Fechas. 
•	Reglamentos. 
•	Resultados (con permisos). 
•	
Nunca podrán modificarse las categorías una vez iniciado.

6.6 Cancelación
Un torneo podrá cancelarse antes o durante su desarrollo.
El sistema conservará toda la información histórica.
Nunca eliminará datos.






















7. Inscripciones
7.1 Apertura
El profesor decide cuándo abrir y cerrar las inscripciones.

7.2 Flujo del jugador
El jugador:
Selecciona torneo.
↓
Selecciona categoría.
↓
Realiza el pago.
↓
Confirma inscripción.
↓
Recibe comprobante.

7.3 Disponibilidad
La disponibilidad no se carga durante la inscripción.
Cuando GAME conoce que un jugador tiene un próximo partido, el sistema solicita confirmar asistencia para ese partido.
El jugador marca únicamente los horarios en los que NO puede jugar, usando los horarios configurados por el profesor para el torneo.
Todos los horarios no marcados se consideran disponibles.
La disponibilidad se guarda por partido y no como disponibilidad global del jugador.

7.4 Doble categoría
Si un jugador se inscribe en dos categorías, el sistema advertirá posibles conflictos. Posteriormente el cronograma intentará evitar superposiciones.

7.5 Pago
La inscripción quedará pendiente hasta recibir la confirmación del pago mediante Mercado Pago.
7.6 Cupos
Cada categoría podrá tener:
•	Cupo ilimitado. 
•	Cupo máximo. 
Si se completa el cupo:
Los nuevos jugadores quedarán en lista de espera.

7.7 Baja de inscripción
El profesor podrá eliminar una inscripción antes del comienzo del torneo.
El sistema registrará el motivo.
8. Sistema de ranking
8.1 Objetivo
El ranking refleja el rendimiento deportivo de cada jugador dentro del circuito GAME.

8.2 Tipos de ranking
El sistema administrará tres rankings diferentes.
Ranking General
Se utiliza para:
•	Cabezas de serie. 
•	Desempates. 

Ranking por Categoría
Muestra la clasificación únicamente dentro de cada categoría.
Ranking Histórico
Conserva todos los puntos obtenidos desde el inicio del sistema.
El profesor podrá editar estos puntos en caso de que el jugador posea puntos a la hora de la entrega de este proyecto.
Nunca elimina información.

8.3 Obtención de puntos
Los puntos se obtendrán según la tabla configurada para cada torneo.
Conceptos posibles:
•	Participación. 
•	Inscripción. 
•	Jugar preliminar. 
•	Ganar preliminar. 
•	Clasificar. 
•	Octavos. 
•	Cuartos. 
•	Semifinal. 
•	Final. 
•	Campeón. 

8.4 Historial
Cada movimiento quedará registrado.
Ejemplo:
Jugador: Sebastian Gallardo
Torneo: GAME 1000
Concepto: Ganó Cuartos
Puntos: +120
Fecha

8.5 Ajustes manuales
El profesor podrá agregar, descontar o modificar puntos, siempre indicando el motivo.

8.6 Actualización
El ranking se actualizará automáticamente cada vez que finalice un partido.
No será necesario recalcular manualmente.
9. Sistema de puntajes
9.1 Configuración
Cada tipo de torneo tendrá su propia tabla.
Ejemplo:
GAME 250
GAME 500
GAME 1000
MASTER GAME 1500

9.2 Conceptos puntuables
El profesor podrá definir:
Puntos por inscripción.
Puntos por jugar la preliminar.
Bonus por ganar la preliminar.
Puntos por clasificación.
Puntos por cada ronda.
Puntos por campeón.
Puntos por subcampeón.
Bonus especiales.

9.3 Acumulación
Los puntos serán acumulativos.
Puntaje total del torneo
Estos puntos de cada torneo se sumarán al ranking general del jugador

9.4 Penalizaciones
También podrán descontarse puntos por:
W.O.
Sanciones disciplinarias.
Abandono.
Otras reglas configurables.

9.5 Historial
Todo movimiento quedará registrado.
Nunca se perderá información.








10. Formatos de torneo
GAME contará inicialmente con tres formatos.

10.1 Zonas
Todos contra todos.
Luego eliminación directa.
El profesor define:
•	Cantidad de zonas. 
•	Cantidad de jugadores. 
•	Clasificados por zona. 

Empates:
1.	Partidos ganados. 
2.	Sets. 
3.	Games. 
4.	Ranking General. 
5.	Partido desempate. 

10.2 Preliminar
Todos los jugadores disputan un partido preliminar.
La preliminar tiene tres objetivos:
•	Sumar puntos. 
•	Generar ranking interno del torneo. 
•	Definir el cuadro principal. 
Los jugadores se separan en:
Ganadores.
Perdedores.

Cada grupo se ordena según:
1.	Resultado. 
2.	Sets. 
3.	Games. 
4.	Ranking General. 
5.	Partido desempate. 


Las llaves se generan respetando las reglas definidas:
•	Sorteo aleatorio. 
•	Ganadores enfrentan perdedores. 
•	Los dos mejores cabezas de serie del ranking general siempre quedan en mitades opuestas del cuadro, aunque hayan ganado o perdido la preliminar. 
•	Los byes se asignan según el rendimiento en la preliminar, nunca por el ranking general. 
•	Si la cantidad de jugadores no coincide con una llave estándar (8, 16, 32, 64...), el sistema agregará una ronda previa o asignará byes según corresponda. 

10.3 Eliminación Directa
No existen preliminares.
El cuadro se genera directamente.
Si el torneo utiliza ranking:
Los cabezas de serie se distribuyen automáticamente.
Si no utiliza ranking:
Todo el cuadro será sorteado.

10.3.1 Distribución de Cabezas de Serie
Cuando un torneo de Eliminación Directa utilice el Ranking General como criterio de siembra, el sistema ubicará automáticamente a los mejores jugadores respetando la siguiente distribución:

El sistema distribuirá los cuatro mejores jugadores del Ranking General de la siguiente manera:
•	Cabeza de Serie N.º 1: parte superior de la llave. 
•	Cabeza de Serie N.º 2: parte inferior de la llave. 
•	Cabeza de Serie N.º 3: mitad inferior del lado del Cabeza de Serie N.º 2. 
•	Cabeza de Serie N.º 4: mitad inferior del lado del Cabeza de Serie N.º 1. 

Con esta distribución:
•	El Nº1 y el Nº2 únicamente podrán enfrentarse en la final. 
•	El Nº1 y el Nº4 solo podrán enfrentarse en una semifinal. 
•	El Nº2 y el Nº3 solo podrán enfrentarse en una semifinal. 
•	El Nº1 nunca enfrentará al Nº2 antes de la final. 
•	El Nº3 nunca compartirá la misma mitad que el Nº1. 
•	El Nº4 nunca compartirá la misma mitad que el Nº2. 


Sorteo del resto de los jugadores
Una vez ubicados los cabezas de serie, el resto de los participantes será distribuido mediante sorteo aleatorio, respetando las reglas particulares del formato de torneo.


10.4 Reglas especiales
Cada formato podrá tener reglas específicas configurables, por ejemplo:
•	Cantidad de sets por partido. 
•	Uso de super tie-break. 
•	Criterios de desempate. 
•	Cantidad de clasificados por zona. 
•	Puntaje otorgado por ronda. 
•	Penalizaciones por W.O. 
•	Reglas disciplinarias particulares. 











11. Armado de llaves

11.1 Armado automático de llaves
El sistema deberá generar automáticamente las llaves eliminatorias respetando todas las reglas del torneo, minimizando la intervención del profesor.
El algoritmo deberá adaptarse automáticamente a cualquier cantidad de jugadores.

11.2 Tamaños de llaves
GAME trabajará con llaves estándar de:
•	8 jugadores 
•	16 jugadores 
•	32 jugadores 
•	64 jugadores 

El sistema elegirá automáticamente la llave más conveniente según la cantidad de participantes.

11.3 Adaptación automática
Cuando la cantidad de jugadores no coincida exactamente con una llave estándar, el sistema aplicará una de estas dos soluciones:
a) Byes, cuando falten jugadores para completar la llave.
b) Ronda clasificatoria previa, cuando sobren jugadores.
La elección será completamente automática.

11.4 Sorteo
Una vez definidos los jugadores clasificados al cuadro principal, el sistema realizará un sorteo aleatorio.
No existirá un orden preestablecido entre ganadores y perdedores, salvo las reglas especiales definidas para el torneo.

11.5 Reglas obligatorias
El algoritmo siempre deberá respetar las siguientes reglas:
•	Los dos mejores jugadores del Ranking General serán cabezas de serie. 
•	Ambos deberán quedar ubicados en mitades opuestas del cuadro. 
•	Nunca podrán enfrentarse antes de la final. 
•	El resto de los cruces será aleatorio. 
•	Cuando existan restricciones por formato (ganadores vs. perdedores), el algoritmo deberá respetarlas antes de realizar el sorteo. 

11.6 Regeneración
Mientras no se haya disputado ningún partido, el profesor podrá regenerar la llave completa.
Cada regeneración producirá un nuevo sorteo aleatorio.
Una vez iniciado el torneo, la regeneración quedará bloqueada.





12. Programación inteligente
12.1 Objetivo
El sistema deberá distribuir automáticamente todos los partidos del torneo considerando las reglas deportivas y la disponibilidad de infraestructura.
El profesor únicamente definirá:
•	Fechas disponibles. 
•	Horarios. 
•	Canchas. 
•	Día de las finales. 
•	(Opcional) Día de semifinales. 
GAME organizará el resto.
________________________________________
12.2 Variables consideradas
El algoritmo tendrá en cuenta:
•	Disponibilidad del jugador. 
•	Cantidad de canchas. 
•	Cantidad de turnos. 
•	Categoría. 
•	Doble inscripción. 
•	Descanso entre partidos. 
•	Fase del torneo. 
•	Fecha de semifinales. 
•	Fecha de finales. 

12.3 Prioridad deportiva
La prioridad del algoritmo será:
1.	Todas las finales deben disputarse el mismo día. 
2.	Las semifinales deben jugarse lo más cerca posible de las finales. 
3.	Si una categoría debe esperar, se retrasarán las rondas anteriores (preliminares, octavos, cuartos) y no las instancias decisivas. 
4.	Evitar que un jugador dispute dos partidos al mismo horario. 
5.	Evitar que un jugador tenga tiempos de espera excesivos entre partidos de una misma jornada. 

12.4 Reprogramación
El profesor podrá modificar manualmente cualquier partido.
Al hacerlo, el sistema verificará automáticamente:
•	Conflictos de horarios. 
•	Conflictos de canchas. 
•	Superposición de jugadores. 
•	Descansos insuficientes. 
Si detecta algún conflicto, emitirá una advertencia, pero permitirá guardar el cambio bajo responsabilidad del profesor.

12.5 Lluvia y suspensión
Si una jornada se suspende por lluvia u otra causa, el profesor podrá marcarla como suspendida.
El sistema ofrecerá reprogramar automáticamente los partidos pendientes utilizando los turnos disponibles posteriores.
No se modificarán los partidos ya disputados.

13. Partidos
13.1 Estados
Cada partido podrá encontrarse en alguno de los siguientes estados:
•	Pendiente. 
•	Programado. 
•	En juego. 
•	Finalizado. 
•	Suspendido. 
•	Pausado
•	Reprogramado. 
•	W.O. 
•	Doble W.O. 

13.2 Información del partido
Cada partido almacenará:
•	Jugador A. 
•	Jugador B. 
•	Categoría. 
•	Ronda. 
•	Cancha. 
•	Fecha. 
•	Hora. 
•	Resultado. 
•	Estado. 
•	Observaciones. 

13.3 Carga de resultado
Al finalizar un partido, el profesor ingresará:
•	Sets. 
•	Games 
•	Super tie-break (si corresponde). 
El sistema determinará automáticamente el ganador.
________________________________________
13.4 W.O.
El profesor podrá indicar:
•	W.O. del jugador A. 
•	W.O. del jugador B. 
•	Doble W.O. 

El sistema actualizará automáticamente la llave y asignará los puntos según la configuración del torneo.

13.5 Edición
Los resultados podrán corregirse únicamente por el profesor.
Toda modificación quedará registrada en un historial de auditoría.




14. Sistema disciplinario
14.1 Objetivo
GAME incorporará un sistema disciplinario para registrar y administrar faltas ocurridas durante los partidos.
Como los encuentros se disputan sin árbitro permanente, las sanciones serán administradas por el profesor.

14.2 Reclamos
Durante o después de un partido, un jugador podrá informar una conducta antideportiva.
El reclamo quedará pendiente hasta su revisión.

14.3 Confirmación
El profesor decidirá si el reclamo es:
•	Confirmado. 
•	Rechazado. 
Solo los reclamos confirmados generarán una falta.

14.4 Registro de faltas
Cada falta almacenará:
•	Partido. 
•	Jugador sancionado. 
•	Jugador reclamante. 
•	Motivo. 
•	Observaciones. 
•	Fecha. 
•	Profesor responsable. 

14.5 Límite
Cada jugador podrá acumular hasta 3 faltas confirmadas.
Al alcanzar ese límite:
•	Será expulsado del torneo actual. 
•	No podrá inscribirse a nuevos torneos. 
•	Su cuenta quedará bloqueada hasta que el profesor la rehabilite. 

14.6 Estados disciplinarios
Los posibles estados serán:
•	Sin sanciones. 
•	Advertido. 
•	Suspendido del torneo. 
•	Bloqueado. 

14.7 Desbloqueo
Solo el profesor podrá rehabilitar a un jugador.
El sistema registrará:
•	Fecha. 
•	Profesor. 
•	Motivo. 
•	Observaciones. 
15. Notificaciones
15.1 Objetivo
Mantener informados a jugadores y profesor sobre todos los eventos relevantes del torneo.

15.2 Notificaciones al jugador
El jugador recibirá avisos cuando:
•	Se confirme su inscripción. 
•	Se programe un partido. 
•	Se modifique un horario. 
•	Se modifique una cancha. 
•	Reciba una falta disciplinaria. 
•	Su solicitud de descenso sea aceptada o rechazada. 
•	Sea bloqueado o desbloqueado. 

15.3 Notificaciones al profesor
El profesor recibirá avisos cuando:
•	Se solicite un descenso de categoría. 
•	Se registre un reclamo disciplinario. 
•	Un jugador alcance el límite de faltas. 
•	Existan conflictos de programación. 
•	Haya partidos pendientes de cargar. 

15.4 Canales
Las notificaciones podrán enviarse mediante:
•	Avisos dentro de GAME. 
•	Correo electrónico para eventos importantes. 
.

















16. Reglas
Las siguientes reglas son obligatorias para el funcionamiento del sistema.

16.1 Jugadores
Un jugador podrá pertenecer únicamente a una categoría vigente.
Podrá participar en:
•	Su categoría. 
•	Categorías superiores. 
Nunca podrá inscribirse directamente en una categoría inferior.

16.2 Descenso de categoría
Si un jugador desea jugar una categoría inferior:
El sistema generará una solicitud.
Hasta que el profesor no la apruebe:
La inscripción permanecerá bloqueada.

16.3 Ranking
El Ranking General solamente será utilizado para:
•	Determinar cabezas de serie. 
•	Resolver empates cuando todos los demás criterios sean iguales. 
Nunca otorgará byes.
Nunca modificará el orden obtenido en las preliminares.

16.4 Byes
Los byes siempre serán asignados utilizando el Ranking de las Preliminares.
Nunca utilizando el Ranking General.

16.5 Cabezas de serie
Los dos mejores jugadores del Ranking General serán considerados cabezas de serie.
El sistema deberá ubicarlos obligatoriamente en mitades opuestas del cuadro.
Esto deberá cumplirse independientemente del resultado obtenido en las preliminares.

16.6 Programación
La prioridad del sistema será siempre:
1.	Finales. 
2.	Semifinales. 
3.	Cuartos. 
4.	Octavos. 
5.	Preliminares. 
Nunca deberá dejar una semifinal demasiado alejada de la final.


Sí, entonces cambia bastante la definición del **ranking anual** y del **ascenso**. Te lo dejo completo de nuevo, listo para agregar a `docs/estructura.md`:

```markdown
## REGLAS DE W.O. Y CÓMPUTO DE RESULTADOS

Cuando un partido se define por W.O. (Walkover), el resultado debe computarse automáticamente como un resultado deportivo de 6-0 / 6-0.

### Jugador ganador por W.O.

El jugador que gana el partido por W.O. debe registrar, a efectos de cálculos deportivos y estadísticos, el siguiente resultado:

- Set 1: 6-0 a favor.
- Set 2: 6-0 a favor.
- Resultado computable: victoria 6-0 / 6-0.

Este resultado debe utilizarse normalmente para todos los cálculos posteriores que dependan del rendimiento obtenido en el torneo.

Por ejemplo, si el formato del torneo utiliza resultados previos para ordenar o clasificar jugadores, el ganador por W.O. debe ser considerado como si hubiera obtenido una victoria por 6-0 / 6-0.

### Jugador perdedor por W.O.

El jugador que pierde el partido por no presentarse debe registrar, a efectos de cálculos deportivos y estadísticos, el siguiente resultado:

- Set 1: 0-6 en contra.
- Set 2: 0-6 en contra.
- Resultado computable: derrota 0-6 / 0-6.

Este resultado debe afectar normalmente los cálculos posteriores que dependan del rendimiento obtenido.

Por ejemplo, si después de una etapa preliminar es necesario ordenar a los jugadores perdedores para determinar cuáles clasifican directamente y cuáles deben disputar una ronda adicional, una derrota por W.O. debe computarse como 0-6 / 0-6 y, por lo tanto, posicionar al jugador entre los peores resultados según corresponda.

La misma regla debe aplicarse en formatos de torneo por zonas cuando sea necesario calcular posiciones, rendimiento, games ganados, games perdidos u otros criterios derivados de los resultados.

El W.O. debe quedar registrado explícitamente como W.O. en el historial y detalle del partido, aunque para los cálculos deportivos internos se compute como 6-0 / 6-0 a favor del ganador y 0-6 / 0-6 para el jugador que no se presentó.


## CATEGORÍAS DE LOS JUGADORES

Cada jugador debe tener asignada una categoría vigente.

La categoría vigente representa la categoría mínima en la que el jugador puede competir normalmente.

Durante el año, un jugador puede inscribirse y participar tanto en:

- Su categoría vigente.
- Categorías superiores a su categoría vigente.

Esto permite que un jugador pueda competir durante el año en categorías superiores para probar su nivel y competir contra jugadores de mayor categoría.

Un jugador no puede inscribirse libremente en una categoría inferior a su categoría vigente.


## RANKING GLOBAL ANUAL

GAME debe mantener un Ranking Global correspondiente al año deportivo en curso.

El Ranking Global representa los puntos acumulados por los jugadores durante todos los torneos disputados a lo largo del año.

Los jugadores comienzan cada nuevo año deportivo con 0 puntos.

Al comenzar un nuevo año:

- El Ranking Global del año anterior se cierra.
- Los puntos utilizados para el Ranking Global activo se reinician a 0.
- El nuevo Ranking Global comienza vacío.
- Los jugadores que tienen 0 puntos no deben aparecer inicialmente en el Ranking Global.
- Los jugadores comienzan a aparecer en el Ranking Global a medida que obtienen sus primeros puntos durante el nuevo año deportivo.

Esto evita mostrar una clasificación artificial entre jugadores que todavía tienen todos 0 puntos y para los cuales no existe un criterio deportivo que permita establecer una posición real.

Por lo tanto, al comenzar el año el Ranking Global no muestra ningún jugador.

A medida que se disputan torneos y los jugadores obtienen puntos, comienzan a incorporarse automáticamente al Ranking Global y se ordenan según los puntos acumulados durante ese año.

El Ranking Global debe representar exclusivamente la temporada o año deportivo vigente.


## CIERRE ANUAL DEL RANKING Y ASCENSOS DE CATEGORÍA

Al finalizar el año deportivo se debe cerrar el Ranking Global correspondiente a ese año.

El jugador que finalice con la mayor cantidad de puntos en el Ranking Global de cada categoría debe ascender automáticamente a la categoría inmediatamente superior.

El ascenso se determina utilizando la categoría vigente del jugador y su posición dentro del Ranking Global correspondiente a dicha categoría.

Ejemplo:

- Un jugador tiene como categoría vigente la Categoría 3.
- Durante el año puede competir en Categoría 3 y también participar en torneos de Categoría 2 o categorías superiores.
- Al finalizar el año, si es el jugador con mayor cantidad de puntos del Ranking Global correspondiente a su categoría, asciende automáticamente.
- Su nueva categoría vigente pasa a ser Categoría 2.
- A partir del nuevo año deportivo ya no puede volver a competir normalmente en Categoría 3.

El ascenso modifica oficialmente la categoría vigente del jugador.

Una vez aplicado el ascenso, el jugador comienza el nuevo año con:

- Su nueva categoría vigente.
- 0 puntos en el nuevo Ranking Global.
- Sin posición visible en el Ranking Global hasta que obtenga sus primeros puntos del nuevo año.

El Ranking Global del año anterior debe conservarse únicamente como historial, si el sistema dispone de una sección de temporadas o rankings históricos, pero sus puntos no deben trasladarse al Ranking Global del nuevo año.


## PARTICIPACIÓN EN CATEGORÍAS SUPERIORES

Durante el año, un jugador puede competir en categorías superiores a su categoría vigente sin que esto modifique automáticamente su categoría oficial.

Ejemplo:

Un jugador cuya categoría vigente es Categoría 3 puede:

- Jugar torneos de Categoría 3.
- Jugar torneos de Categoría 2.
- Jugar torneos de Categoría 1, si corresponde según la jerarquía configurada.

Participar en una categoría superior durante el año no implica automáticamente un cambio de categoría.

La categoría vigente solo cambia mediante:

- Ascenso automático al finalizar el año.
- Descenso aprobado por el profesor/administrador.


## SOLICITUD DE DESCENSO DE CATEGORÍA

Si un jugador considera que debe regresar a una categoría inferior a su categoría vigente, debe realizar una solicitud formal de descenso de categoría desde el sistema.

El descenso nunca debe realizarse automáticamente ni por decisión unilateral del jugador.

La solicitud debe ser revisada por el profesor/administrador.

Hasta que la solicitud sea aprobada:

- El jugador mantiene su categoría vigente.
- No puede inscribirse en categorías inferiores.
- Puede continuar jugando en su categoría vigente o en categorías superiores.

Si el profesor/administrador aprueba la solicitud:

- Se actualiza la categoría vigente del jugador.
- A partir de ese momento puede competir en la nueva categoría asignada.
- El cambio debe quedar registrado en el historial del jugador.

Si la solicitud es rechazada:

- El jugador conserva su categoría vigente actual.


## REGLA GENERAL DE PARTICIPACIÓN POR CATEGORÍA

La validación de inscripción a un torneo siempre debe realizarse utilizando la categoría vigente del jugador al momento de la inscripción.

El sistema debe permitir:

- Categoría vigente: SÍ.
- Categorías superiores: SÍ.
- Categorías inferiores: NO, salvo que previamente exista una solicitud de descenso aprobada que haya actualizado oficialmente la categoría vigente del jugador.

Los ascensos anuales deben procesarse al finalizar el año deportivo y antes del inicio efectivo de la nueva temporada.

Después de procesar los ascensos:

1. Se actualizan las categorías vigentes de los jugadores que correspondan.
2. Se cierra el Ranking Global del año finalizado.
3. Se inicia el nuevo Ranking Global con todos los jugadores en 0 puntos.
4. El Ranking Global visible comienza vacío.
5. Los jugadores se incorporan nuevamente al ranking a medida que obtienen puntos durante el nuevo año.
```

Así queda definido algo importante: **el ranking no se borra históricamente**, sino que se cierra el ranking de 2026, por ejemplo, y el **ranking activo 2027 arranca vacío**. Eso después nos permite tener historial de campeones y posiciones anuales sin mezclar los puntos entre temporadas.

## CELEBRACIÓN DE ASCENSO DE CATEGORÍA

Cuando un jugador ascienda de categoría como consecuencia del cierre anual del Ranking Global, el sistema deberá registrar que existe un ascenso pendiente de comunicar.

La primera vez que el jugador ingrese a GAME durante el nuevo año deportivo, deberá mostrarse una pantalla especial de celebración antes de acceder normalmente a su panel.

La pantalla deberá comunicar claramente:

- Que el jugador ascendió de categoría.
- Su categoría anterior.
- Su nueva categoría vigente.

Ejemplo:

¡FELICITACIONES!

ASCENDISTE DE CATEGORÍA

Ahora sos Categoría 2

La experiencia podrá incluir una animación visual especial acorde con la identidad de GAME.

El mensaje deberá mostrarse una sola vez.

Una vez que el jugador confirme o cierre la celebración, el sistema deberá registrar que la notificación de ascenso ya fue visualizada y no deberá volver a mostrarse en futuros inicios de sesión.

El ascenso ya debe haber sido aplicado previamente a la categoría vigente del jugador. La pantalla tiene una función exclusivamente informativa y de celebración, y no requiere aceptación por parte del jugador.

## FORMATOS POR CATEGORIA DESPUES DEL CIERRE DE INSCRIPCIONES

El formato deportivo definitivo se define por categoria y no como una unica regla global del torneo.

El flujo correcto es:

1. Crear torneo.
2. Seleccionar categorias participantes.
3. Abrir inscripciones.
4. Recibir inscripciones.
5. Cerrar inscripciones.
6. Contar participantes reales por categoria.
7. GAME propone un formato por categoria.
8. El profesor confirma o cambia manualmente cada formato.
9. Recien despues de confirmar el formato se genera la estructura deportiva de esa categoria.

GAME puede sugerir:

- Eliminacion Directa para cantidades que encajan bien en una llave limpia o requieren pocos byes.
- Zonas para cantidades que no encajan comodamente en una llave y conviene distribuir en grupos.
- Preliminar para categorias numerosas donde el esquema preliminar de GAME resulta conveniente.

La sugerencia no es obligatoria.
El profesor siempre conserva la decision final y puede cambiar cualquier formato sugerido antes de confirmarlo.

Estados posibles por categoria:

- Formato pendiente.
- Formato sugerido.
- Formato confirmado.
- Sin inscriptos.

No debe generarse una llave, preliminar o zona definitiva para una categoria hasta que el formato de esa categoria este confirmado.
Una categoria sin inscriptos no genera formato ni estructura deportiva.

## REGLAS DE GENERACION POR FORMATO

Cada categoria genera una estructura independiente segun su formato y su cantidad real de participantes.
No debe reutilizarse una misma llave para Preliminar, Zonas y Eliminacion Directa.

### Eliminacion Directa

Eliminacion Directa no utiliza preliminares.
Si la cantidad entra exactamente en un cuadro base, se genera directamente ese cuadro.

Ejemplos:

- 16 jugadores: 8 partidos de 16avos, 4 cuartos, 2 semifinales y 1 final.
- 32 jugadores: 16 partidos de 16avos, 8 octavos, 4 cuartos, 2 semifinales y 1 final.

Si sobran jugadores respecto del cuadro base inmediato, GAME genera una ronda previa para completar el cuadro sin crear byes masivos.
Ejemplo con 34 jugadores:

- 4 jugadores disputan 2 partidos de 32avos.
- Los 2 ganadores completan un cuadro principal de 32.
- Luego se generan 16avos, octavos, cuartos, semifinal y final.

No se debe crear una llave de 64 con 30 byes para resolver 34 jugadores.

### Preliminar

Preliminar tiene una logica propia.
Todos los jugadores disputan un partido preliminar cuando existe rival disponible.
Con 34 jugadores se generan 17 partidos preliminares.

Luego se ordenan ganadores y perdedores segun rendimiento preliminar.
Para el caso oficial de 34 jugadores:

- Clasifican los 17 ganadores.
- Clasifican directamente los 13 mejores perdedores.
- Los 4 peores perdedores disputan 2 partidos de 32avos.
- Los 2 ganadores de 32avos completan el cuadro de 32.
- En 16avos se generan 16 partidos.

El ranking general solo se usa para cabezas de serie o desempates cuando corresponda.
No debe reemplazar el orden deportivo obtenido en preliminares.

### Zonas

Zonas utiliza grupos pequenos y equilibrados.
Las zonas deben tener normalmente 3 o 4 jugadores.
No se deben generar dos zonas gigantes para cantidades altas o incomodas.

Ejemplos:

- 11 jugadores: distribucion equilibrada de 4, 4 y 3.
- 23 jugadores: distribucion equilibrada en varias zonas de 3 y 4 jugadores.

Dentro de cada zona todos juegan contra todos.
La fase eliminatoria posterior se genera despues de conocer los clasificados de cada zona.
