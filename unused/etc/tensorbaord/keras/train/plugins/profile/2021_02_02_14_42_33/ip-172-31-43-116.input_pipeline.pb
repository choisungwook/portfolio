	i��U��?i��U��?!i��U��?	��G�)
@��G�)
@!��G�)
@"e
=type.googleapis.com/tensorflow.profiler.PerGenericStepDetails$i��U��?d�CԷ�?A �E
e��?Yt
��?*	�K7�A�S@2l
5Iterator::Model::ParallelMapV2::Zip[1]::ForeverRepeatSv�A]��?!9`I�Q�D@)�Q�U�?1
}�.�2A@:Preprocessing2U
Iterator::Model::ParallelMapV2)	���?�?!�i)l5@))	���?�?1�i)l5@:Preprocessing2F
Iterator::Model���B�?!�hMM�@@)M�J��?1�{���(@:Preprocessing2f
/Iterator::Model::ParallelMapV2::Zip[0]::FlatMap���2���?!���,1@)�j��P��?1�⊆�$@:Preprocessing2Z
#Iterator::Model::ParallelMapV2::ZippB!��?!�KYY�P@)��^���x?10����@:Preprocessing2x
AIterator::Model::ParallelMapV2::Zip[1]::ForeverRepeat::FromTensor+l� [v?!}O��@)+l� [v?1}O��@:Preprocessing2v
?Iterator::Model::ParallelMapV2::Zip[0]::FlatMap[0]::TensorSliceE���V	v?!��D3y^@)E���V	v?1��D3y^@:Preprocessing:�
]Enqueuing data: you may want to combine small input data chunks into fewer but larger chunks.
�Data preprocessing: you may increase num_parallel_calls in <a href="https://www.tensorflow.org/api_docs/python/tf/data/Dataset#map" target="_blank">Dataset map()</a> or preprocess the data OFFLINE.
�Reading data from files in advance: you may tune parameters in the following tf.data API (<a href="https://www.tensorflow.org/api_docs/python/tf/data/Dataset#prefetch" target="_blank">prefetch size</a>, <a href="https://www.tensorflow.org/api_docs/python/tf/data/Dataset#interleave" target="_blank">interleave cycle_length</a>, <a href="https://www.tensorflow.org/api_docs/python/tf/data/TFRecordDataset#class_tfrecorddataset" target="_blank">reader buffer_size</a>)
�Reading data from files on demand: you should read data IN ADVANCE using the following tf.data API (<a href="https://www.tensorflow.org/api_docs/python/tf/data/Dataset#prefetch" target="_blank">prefetch</a>, <a href="https://www.tensorflow.org/api_docs/python/tf/data/Dataset#interleave" target="_blank">interleave</a>, <a href="https://www.tensorflow.org/api_docs/python/tf/data/TFRecordDataset#class_tfrecorddataset" target="_blank">reader buffer</a>)
�Other data reading or processing: you may consider using the <a href="https://www.tensorflow.org/programmers_guide/datasets" target="_blank">tf.data API</a> (if you are not using it now)�
:type.googleapis.com/tensorflow.profiler.BottleneckAnalysis�
both�Your program is MODERATELY input-bound because 7.3% of the total step time sampled is waiting for input. Therefore, you would need to reduce both the input time and other time.no*high2t42.4 % of the total step time sampled is spent on 'All Others' time. This could be due to Python execution overhead.9��G�)
@Ip�{f]/W@Zno>Look at Section 3 for the breakdown of input time on the host.B�
@type.googleapis.com/tensorflow.profiler.GenericStepTimeBreakdown�
	d�CԷ�?d�CԷ�?!d�CԷ�?      ��!       "      ��!       *      ��!       2	 �E
e��? �E
e��?! �E
e��?:      ��!       B      ��!       J	t
��?t
��?!t
��?R      ��!       Z	t
��?t
��?!t
��?b      ��!       JCPU_ONLYY��G�)
@b qp�{f]/W@